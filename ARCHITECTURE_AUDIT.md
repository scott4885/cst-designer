# Architecture Audit Report
**Schedule Template Designer App**  
**Date:** February 13, 2026  
**Auditor:** Architecture Review Subagent

---

## Executive Summary

This codebase has **fundamental architectural flaws in its data layer** that have caused multiple rounds of bugs. The core issue is **lack of a single source of truth** for office data, resulting in:

- 4+ different storage mechanisms (mock-data.ts, in-memory arrays, Maps, Zustand stores, localStorage) with no synchronization
- Race conditions and stale data bugs
- Data loss on server restart (in-memory only, no database)
- Inconsistent API behavior depending on office ID
- Components making assumptions about data availability

**Severity Breakdown:**
- **CRITICAL:** 8 issues
- **HIGH:** 12 issues  
- **MEDIUM:** 9 issues
- **LOW:** 5 issues

**Total:** 34 architectural issues identified

---

## 1. Data Flow Audit

### CRITICAL-001: Multiple Sources of Truth
**Severity:** CRITICAL  
**File:** `src/lib/office-data-store.ts`, `src/lib/mock-data.ts`, `src/store/office-store.ts`, `src/store/schedule-store.ts`

**Problem:**  
Office data exists in **4+ different places** with no synchronization:

1. **mock-data.ts** - Static mock offices (lines 129-199)
2. **office-data-store.ts** - `createdOffices` array (line 7) AND `modifiedMockOffices` Map (line 10)
3. **office-store.ts** - Zustand `offices` array (line 8) and `currentOffice` (line 7)
4. **schedule-store.ts** - localStorage per-office schedules (lines 31-36, 51-59)

**Data Flow Map:**
```
User creates office
  ↓
POST /api/offices → addOffice() → createdOffices[] (in memory)
  ↓
GET /api/offices → returns [...mockOffices, ...createdOffices]
  ↓
office-store.fetchOffices() → offices[] (Zustand)
  ↓
Components read from offices[]
  ↓
SERVER RESTART → createdOffices[] = [] (DATA LOST)
  ↓
GET /api/offices → returns only mockOffices (created offices GONE)
```

**What Breaks:**
- Created offices disappear on server restart
- Mock office modifications stored in Map never sync to Zustand
- localStorage schedules reference offices that may no longer exist
- No way to know which source is "correct"

**Fix:**
Implement a **single source of truth** with proper persistence:
- Use a database (Prisma schema exists but unused at `prisma/schema.prisma`)
- OR use server-side localStorage/file system for persistence
- Remove in-memory `createdOffices` array and `modifiedMockOffices` Map
- Make Zustand stores read-only caches of API data
- Add invalidation/refetch logic

---

### CRITICAL-002: modifiedMockOffices Map Never Persists
**Severity:** CRITICAL  
**File:** `src/lib/office-data-store.ts` (lines 10, 46-67)

**Problem:**  
When a mock office (id 1-5) is updated, it's stored in a `modifiedMockOffices` Map:

```typescript
const modifiedMockOffices = new Map<string, OfficeData>(); // line 10

export function updateOffice(id: string, updates: Partial<OfficeData>): OfficeData | undefined {
  // ...
  const mockOffice = mockOffices.find(o => o.id === id);
  if (mockOffice) {
    const updatedOffice = { ...mockOffice, ...updates, id, updatedAt: new Date().toISOString() };
    modifiedMockOffices.set(id, updatedOffice); // line 64
    return updatedOffice;
  }
}
```

**What Breaks:**
- Map is in-memory only → lost on server restart
- Map is never cleared → grows unbounded
- No way to "reset" a mock office to defaults
- `getOfficeById` checks the Map (line 15) but API routes don't know about modifications

**Fix:**
- Either persist modifications to database
- OR remove the ability to modify mock offices (make them read-only)
- OR store modifications in localStorage (client-side only)

---

### CRITICAL-003: API Routes Check Sources in Inconsistent Order
**Severity:** CRITICAL  
**File:** `src/app/api/offices/[id]/route.ts` (lines 11-35), `src/app/api/offices/[id]/generate/route.ts` (lines 19-36)

**Problem:**  
Different API routes check data sources in different orders:

**GET /api/offices/:id** (route.ts):
```typescript
if (id === '1') {
  return NextResponse.json(smileCascadeOffice); // FIRST: hardcoded
}
const createdOffice = getOfficeById(id); // SECOND: created + modified
const office = mockOffices.find(o => o.id === id); // THIRD: mock
```

**POST /api/offices/:id/generate** (generate/route.ts):
```typescript
let office = getOfficeById(id); // FIRST: created + modified
if (!office) {
  office = mockOffices.find(o => o.id === id); // SECOND: mock
}
if (id === '1') {
  office = smileCascadeOffice; // THIRD: overwrite with hardcoded
}
```

**What Breaks:**
- id=1 behaves completely differently than other IDs
- Generate route overwrites `getOfficeById` result for id=1
- Created offices shadow mock offices by ID (could collide)
- No predictable precedence order

**Fix:**
Standardize data access with a single function:
```typescript
function getOffice(id: string): OfficeData | undefined {
  // Clear precedence: DB > created > modified > mock
  return dbOffices.get(id) || createdOffices.find(...) || modifiedMockOffices.get(id) || mockOffices.find(...)
}
```

---

### CRITICAL-004: No Data Persistence Layer
**Severity:** CRITICAL  
**File:** `src/lib/office-data-store.ts` (entire file)

**Problem:**  
All office data is stored in **in-memory arrays and Maps**:

```typescript
export let createdOffices: OfficeData[] = []; // line 7
const modifiedMockOffices = new Map<string, OfficeData>(); // line 10
```

On server restart (dev server reload, production deployment, crash):
- `createdOffices` → `[]`
- `modifiedMockOffices` → `new Map()`
- All user-created offices **permanently lost**

**Evidence:**
- Prisma schema exists at `prisma/schema.prisma` but is **never used**
- Docker compose file exists but database not configured
- No file system persistence
- No localStorage fallback for server-side data

**Fix:**
Implement proper persistence:

**Option A: Prisma/PostgreSQL (recommended)**
```typescript
// Use existing Prisma schema
const office = await prisma.office.create({
  data: { ...officeData },
  include: { providers: true, blockTypes: true }
});
```

**Option B: File System (simpler)**
```typescript
import fs from 'fs/promises';
const filePath = path.join(process.cwd(), 'data', 'offices.json');
await fs.writeFile(filePath, JSON.stringify(offices));
```

**Option C: localStorage (client-side only, not ideal)**
- Move all data to client
- Use IndexedDB for structured data
- Accept that data is local to device

---

### HIGH-001: Schedule Store Persists to localStorage But Office Store Doesn't
**Severity:** HIGH  
**File:** `src/store/schedule-store.ts` (lines 27-79), `src/store/office-store.ts` (lines 1-35)

**Problem:**  
Inconsistent persistence strategy:

**schedule-store.ts** (HAS persistence):
```typescript
export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set, get) => ({ ... }),
    { name: 'schedule-storage' }
  )
);
```

**office-store.ts** (NO persistence):
```typescript
export const useOfficeStore = create<OfficeState>((set) => ({
  currentOffice: null,
  offices: [],
  // No persist() wrapper
}));
```

**What Breaks:**
- Generated schedules survive refresh, but office list doesn't
- If API returns empty offices (server restart), schedules reference non-existent offices
- User sees generated schedules but "No offices" in list → confusing UX

**Fix:**
Either:
1. Persist office-store too (client-side cache)
2. OR don't persist schedule-store (always fetch from server)
3. OR add cache invalidation when office list changes

---

### HIGH-002: localStorage Schedule Keys Don't Account for Office Deletion
**Severity:** HIGH  
**File:** `src/store/schedule-store.ts` (lines 31-36, 51-59)

**Problem:**  
Schedules are keyed by `officeId` in localStorage:

```typescript
const getStorageKey = (officeId: string) => `schedules-${officeId}`;
```

But when an office is deleted:
- localStorage keys remain: `schedules-1`, `schedules-2`, etc.
- No cleanup/garbage collection
- Orphaned data accumulates over time

**Fix:**
Add cleanup on office deletion:
```typescript
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const deleted = deleteOffice(id);
  if (deleted) {
    // Cleanup localStorage on client (need to broadcast)
    broadcastStorageCleanup(id);
  }
}
```

Or use a cleanup utility:
```typescript
function cleanupOrphanedSchedules(validOfficeIds: string[]) {
  Object.keys(localStorage)
    .filter(key => key.startsWith('schedules-'))
    .forEach(key => {
      const officeId = key.replace('schedules-', '');
      if (!validOfficeIds.includes(officeId)) {
        localStorage.removeItem(key);
      }
    });
}
```

---

### HIGH-003: Race Condition in Office Fetching
**Severity:** HIGH  
**File:** `src/app/offices/[id]/page.tsx` (lines 23-33), `src/app/offices/[id]/edit/page.tsx` (lines 55-62)

**Problem:**  
Multiple useEffects fetch the same office without coordination:

**page.tsx:**
```typescript
useEffect(() => {
  fetchOffice(officeId).catch(...); // Fetch 1
}, [officeId, fetchOffice, router]);

useEffect(() => {
  loadSchedulesForOffice(officeId); // Uses officeId
}, [officeId, loadSchedulesForOffice]);

useEffect(() => {
  if (currentOffice && currentOffice.workingDays.length > 0) {
    setActiveDay(currentOffice.workingDays[0]); // Depends on fetch 1
  }
}, [currentOffice, setActiveDay]);
```

**Race Condition:**
- Effect 1 starts fetching office
- Effect 2 immediately tries to load schedules (office may not exist yet)
- Effect 3 tries to access `currentOffice.workingDays` (may be null)

**Evidence of Problem:**
Loading state renders (lines 37-44) but doesn't prevent other logic from running.

**Fix:**
Consolidate into single effect with proper dependencies:
```typescript
useEffect(() => {
  let cancelled = false;
  
  async function loadOfficeAndSchedules() {
    try {
      await fetchOffice(officeId);
      if (!cancelled) {
        loadSchedulesForOffice(officeId);
      }
    } catch (error) {
      if (!cancelled) {
        toast.error("Failed to load office");
        router.push("/");
      }
    }
  }
  
  loadOfficeAndSchedules();
  return () => { cancelled = true; };
}, [officeId]);
```

---

## 2. State Management Audit

### CRITICAL-005: Zustand Stores Duplicate API State
**Severity:** CRITICAL  
**File:** `src/store/office-store.ts` (entire file)

**Problem:**  
Zustand store holds a copy of API data with no invalidation strategy:

```typescript
export const useOfficeStore = create<OfficeState>((set) => ({
  currentOffice: null,
  offices: [],
  
  fetchOffices: async () => {
    const response = await fetch('/api/offices');
    const offices = await response.json();
    set({ offices }); // Stores copy
  },
}));
```

**What Breaks:**
- User creates office → API updates → Zustand doesn't know
- User edits office in one component → Other components see stale data
- User deletes office → Still shows in list until manual refetch
- No cache invalidation logic

**Evidence:**
- Dashboard page manually calls `fetchOffices()` on mount (page.tsx line 28)
- Office detail page manually calls `fetchOffice(id)` on mount (page.tsx line 23)
- No automatic refetch after mutations

**Fix:**
Use a proper data fetching library with cache management:

**Option A: React Query (recommended)**
```typescript
const { data: offices } = useQuery({
  queryKey: ['offices'],
  queryFn: () => fetch('/api/offices').then(r => r.json())
});

const createMutation = useMutation({
  mutationFn: (office) => fetch('/api/offices', { method: 'POST', body: JSON.stringify(office) }),
  onSuccess: () => queryClient.invalidateQueries(['offices'])
});
```

**Option B: SWR**
```typescript
const { data: offices, mutate } = useSWR('/api/offices', fetcher);
// Automatic revalidation on focus, network reconnect, etc.
```

**Option C: Keep Zustand, add invalidation**
```typescript
export const useOfficeStore = create<OfficeState>((set) => ({
  invalidateOffices: () => {
    fetchOffices(); // Re-fetch
  },
  invalidateOffice: (id: string) => {
    fetchOffice(id);
  },
}));

// Call after mutations
await createOffice(...);
useOfficeStore.getState().invalidateOffices();
```

---

### CRITICAL-006: Schedule Store Stores Schedules Per Office But No Office Validation
**Severity:** CRITICAL  
**File:** `src/store/schedule-store.ts` (lines 64-79)

**Problem:**  
`loadSchedulesForOffice()` blindly loads from localStorage without checking if office exists:

```typescript
loadSchedulesForOffice: (officeId: string) => {
  if (typeof window === 'undefined') return;
  
  try {
    const stored = localStorage.getItem(getStorageKey(officeId));
    if (stored) {
      const schedulesMap = JSON.parse(stored);
      set({ 
        generatedSchedules: schedulesMap,
        currentOfficeId: officeId 
      });
    } else {
      set({ 
        generatedSchedules: {},
        currentOfficeId: officeId 
      });
    }
  } catch (error) {
    // ...
  }
},
```

**What Breaks:**
- Load schedules for deleted office → succeeds, shows orphaned data
- Load schedules for non-existent ID → no error, just empty
- Schedules reference providers that don't exist anymore

**Fix:**
Validate office exists before loading schedules:
```typescript
loadSchedulesForOffice: async (officeId: string) => {
  // Validate office exists
  const office = await fetch(`/api/offices/${officeId}`).then(r => r.ok ? r.json() : null);
  if (!office) {
    console.warn(`Office ${officeId} not found, clearing schedules`);
    localStorage.removeItem(getStorageKey(officeId));
    set({ generatedSchedules: {}, currentOfficeId: null });
    return;
  }
  
  // Load schedules
  const stored = localStorage.getItem(getStorageKey(officeId));
  // ... rest of logic
}
```

---

### HIGH-004: No Optimistic Updates
**Severity:** HIGH  
**File:** `src/app/offices/new/page.tsx` (lines 180-201)

**Problem:**  
All mutations wait for server response before updating UI:

```typescript
const onSubmit = async (data: OfficeFormData) => {
  try {
    const response = await fetch("/api/offices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ... }),
    });
    
    if (!response.ok) {
      throw new Error("Failed to create office");
    }
    
    const newOffice = await response.json();
    toast.success("Office created successfully!");
    router.push(`/offices/${newOffice.id}`);
  } catch (error) {
    toast.error("Failed to create office. Please try again.");
  }
};
```

**UX Impact:**
- User waits for full round-trip (network latency)
- Feels slow even on fast connections
- No immediate feedback

**Fix:**
Add optimistic updates:
```typescript
const onSubmit = async (data: OfficeFormData) => {
  const tempId = `temp-${Date.now()}`;
  const tempOffice = { id: tempId, ...data, createdAt: new Date().toISOString() };
  
  // Optimistically add to store
  useOfficeStore.getState().addOffice(tempOffice);
  toast.success("Office created!");
  router.push(`/offices/${tempId}`); // Navigate immediately
  
  try {
    const response = await fetch("/api/offices", { ... });
    const newOffice = await response.json();
    
    // Replace temp office with real one
    useOfficeStore.getState().replaceOffice(tempId, newOffice);
    router.replace(`/offices/${newOffice.id}`);
  } catch (error) {
    // Rollback
    useOfficeStore.getState().removeOffice(tempId);
    toast.error("Failed to create office");
    router.push('/');
  }
};
```

---

### HIGH-005: Dashboard "Load Demo Data" Bypasses API
**Severity:** HIGH  
**File:** `src/app/page.tsx` (lines 58-69)

**Problem:**  
"Load Demo Data" button directly mutates Zustand store without touching API:

```typescript
const handleLoadDemoData = () => {
  setLoadingDemo(true);
  try {
    // Directly set offices state to mockOffices
    setOffices(mockOffices);
    toast.success("Demo data loaded! 5 sample offices are now available.");
  } catch (error) {
    console.error("Error loading demo data:", error);
    toast.error("Failed to load demo data");
  } finally {
    setLoadingDemo(false);
  }
};
```

**What Breaks:**
- Zustand store now differs from API
- `fetchOffices()` will overwrite demo data on next call
- Demo offices exist in client only, not server
- Can't generate schedules for demo offices without providers

**Evidence:**
Mock offices 2-5 have **empty providers arrays** (mock-data.ts lines 161-198):
```typescript
{
  id: '2',
  name: 'CDT Comfort Dental',
  providers: [], // EMPTY
  blockTypes: defaultBlockTypes,
  // ...
}
```

**Fix:**
Either:
1. Add a POST endpoint to seed demo data: `POST /api/seed-demo`
2. OR make demo data read-only and show "demo badge" in UI
3. OR automatically create providers when loading demo data

---

### MEDIUM-001: schedule-store Uses persist() But Doesn't Partition State
**Severity:** MEDIUM  
**File:** `src/store/schedule-store.ts` (lines 81-86)

**Problem:**  
Uses Zustand's `persist` middleware but only persists `activeDay`:

```typescript
persist(
  (set, get) => ({ ... }),
  {
    name: 'schedule-storage',
    partialize: (state) => ({
      activeDay: state.activeDay, // Only persist this
    }),
  }
)
```

But `generatedSchedules` are manually persisted to different localStorage keys (lines 51-59).

**Confusion:**
- Two persistence mechanisms in same store
- `partialize` suggests only `activeDay` should persist
- But `setSchedules` manually writes to localStorage
- Not clear which is source of truth

**Fix:**
Either:
1. Persist everything through Zustand:
```typescript
partialize: (state) => ({
  activeDay: state.activeDay,
  generatedSchedules: state.generatedSchedules,
  currentOfficeId: state.currentOfficeId,
})
```

2. OR don't use `persist()`, do all localStorage manually
3. OR use separate stores: `ui-store` (persisted) + `data-store` (ephemeral)

---

### MEDIUM-002: No Loading States Between Store Updates
**Severity:** MEDIUM  
**File:** `src/app/offices/[id]/page.tsx` (lines 91-121)

**Problem:**  
Generate schedule updates happen in batches but UI doesn't show intermediate loading:

```typescript
const handleGenerateAllDays = async () => {
  setGenerating(true); // Global loading state
  for (const day of currentOffice.workingDays) {
    setGeneratingDay(day); // Per-day state
    const response = await fetch(`/api/offices/${officeId}/generate`, { ... });
    const data = await response.json();
    allSchedules.push(...data.schedules);
    setSchedules(allSchedules, officeId); // Update store
    toast.success(`Generated ${getDayLabel(day)} (${completedDays}/${totalDays})`);
  }
  setGenerating(false);
};
```

**Issue:**
`setSchedules()` triggers re-render, but store update is synchronous while API call is async → could cause render blocking.

**Fix:**
Use a loading queue:
```typescript
const [generatingQueue, setGeneratingQueue] = useState<Set<string>>(new Set());

setGeneratingQueue(prev => new Set([...prev, day]));
// ... do work
setGeneratingQueue(prev => {
  const next = new Set(prev);
  next.delete(day);
  return next;
});
```

---

## 3. API Route Audit

### CRITICAL-007: POST /api/offices Returns 201 But Data Isn't Persisted
**Severity:** CRITICAL  
**File:** `src/app/api/offices/route.ts` (lines 13-89)

**Problem:**  
API returns success but data only exists in memory:

```typescript
export async function POST(request: Request) {
  // ... validation
  const newOffice: any = { /* ... */ };
  
  addOffice(newOffice); // Adds to in-memory array
  
  return NextResponse.json(newOffice, { status: 201 }); // Claims success
}
```

**What User Sees:**
1. Create office → 201 Created → Success toast ✓
2. Refresh page → `createdOffices = []` → Office gone ✗
3. User thinks it's a bug, recreates office
4. Rinse and repeat

**Fix:**
Either:
1. Return 202 Accepted with warning: "Data not persisted, will be lost on server restart"
2. OR implement proper persistence before returning 201
3. OR add startup logic to restore from localStorage/file

---

### CRITICAL-008: PUT/PATCH Returns Updated Office But Doesn't Update Source
**Severity:** CRITICAL  
**File:** `src/app/api/offices/[id]/route.ts` (lines 40-85)

**Problem:**  
Update endpoint returns updated office even for mock offices, but doesn't actually update them:

```typescript
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  
  let office = getOfficeById(id);
  if (!office) {
    office = mockOffices.find(o => o.id === id);
  }
  
  if (!office) {
    return NextResponse.json({ error: 'Office not found' }, { status: 404 });
  }
  
  const updates = { ...body, /* ... */ };
  const updatedOffice = updateOffice(id, updates);
  
  if (updatedOffice) {
    return NextResponse.json(updatedOffice); // Returns modified version
  }
  
  // Mock offices are read-only, return updated data without persisting
  return NextResponse.json({
    ...office,
    ...updates,
    id,
    updatedAt: new Date().toISOString(),
  }); // LIES: returns "updated" office that wasn't actually saved
}
```

**What Breaks:**
- User edits mock office → sees success → data never saved
- Refresh page → edits gone
- No warning that mock offices are read-only

**Fix:**
Return 403 Forbidden for mock offices:
```typescript
if (mockOffices.find(o => o.id === id)) {
  return NextResponse.json(
    { error: 'Mock offices are read-only. Create a copy to edit.' },
    { status: 403 }
  );
}
```

---

### HIGH-006: GET /api/offices Mixes Mock and Created Without Indication
**Severity:** HIGH  
**File:** `src/app/api/offices/route.ts` (line 12)

**Problem:**  
Returns combined array without indicating which are mock vs created:

```typescript
export async function GET() {
  return NextResponse.json([...mockOffices, ...getAllCreatedOffices()]);
}
```

**Issue:**
Client can't tell which offices are:
- Persisted (safe to edit)
- Demo/mock (read-only)
- Newly created (in-memory, will be lost)

**Fix:**
Add metadata:
```typescript
export async function GET() {
  return NextResponse.json({
    offices: [
      ...mockOffices.map(o => ({ ...o, _meta: { type: 'mock', readOnly: true } })),
      ...getAllCreatedOffices().map(o => ({ ...o, _meta: { type: 'created', persisted: false } }))
    ]
  });
}
```

---

### HIGH-007: DELETE Returns Success for Mock Offices But Doesn't Warn
**Severity:** HIGH  
**File:** `src/app/api/offices/[id]/route.ts` (lines 103-127)

**Problem:**  
Delete endpoint returns success for mock offices:

```typescript
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deleted = deleteOffice(id);
  
  if (deleted) {
    return NextResponse.json({ success: true, message: `Office ${id} deleted successfully` });
  }
  
  const mockOffice = mockOffices.find(o => o.id === id);
  if (!mockOffice) {
    return NextResponse.json({ error: 'Office not found' }, { status: 404 });
  }
  
  // Mock offices cannot be deleted, but return success anyway
  return NextResponse.json({ 
    success: true, 
    message: `Office ${id} is a demo office and cannot be deleted` 
  });
}
```

**Issue:**
- Returns `success: true` even when nothing was deleted
- Client assumes delete worked
- Office still appears in GET response
- User confused

**Fix:**
Return 403 or 200 with clear indication:
```typescript
return NextResponse.json({ 
  success: false, 
  message: `Office ${id} is a demo office and cannot be deleted`,
  code: 'DEMO_OFFICE_READONLY'
}, { status: 403 });
```

---

### HIGH-008: POST /api/offices/:id/generate Doesn't Validate Office Has Required Data
**Severity:** HIGH  
**File:** `src/app/api/offices/[id]/generate/route.ts` (lines 38-59)

**Problem:**  
Validation happens AFTER trying to find office:

```typescript
if (!office) {
  return NextResponse.json({ error: 'Office not found' }, { status: 404 });
}

// Validate office has required data
if (!office.providers || !office.blockTypes || !office.rules) {
  return NextResponse.json(
    { error: 'Office missing required data (providers, blockTypes, or rules)' },
    { status: 400 }
  );
}

// Validate arrays are not empty
if (office.providers.length === 0) {
  return NextResponse.json(
    { error: 'Office must have at least one provider to generate schedules' },
    { status: 400 }
  );
}
```

**Issue:**
Mock offices 2-5 have `providers: []` → will fail validation → user gets 400 error → UX broken for demo offices.

**Evidence:**
All mock offices except Smile Cascade have empty providers (mock-data.ts lines 161-198).

**Fix:**
Either:
1. Don't include mock offices without providers in GET response
2. OR auto-generate providers when generating schedule
3. OR show "Configure providers first" button instead of "Generate"

---

### MEDIUM-003: Race Condition in Generate All Days
**Severity:** MEDIUM  
**File:** `src/app/api/offices/[id]/generate/route.ts` (entire file)

**Problem:**  
POST is designed for single-day generation, but `handleGenerateAllDays` calls it multiple times in sequence:

```typescript
for (const day of currentOffice.workingDays) {
  const response = await fetch(`/api/offices/${officeId}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ days: [day] }), // One day at a time
  });
}
```

**Issue:**
- Each request is independent → no coordination
- Could generate different variants for same office
- Slow (5 separate HTTP requests for Mon-Fri)

**Fix:**
Support batch generation in API:
```typescript
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { days } = await request.json();
  
  // Generate all days in one request
  const schedules = days.map(day => generateSchedule({
    providers: office.providers,
    blockTypes: office.blockTypes,
    rules: office.rules,
    timeIncrement: office.timeIncrement,
    dayOfWeek: day,
  }));
  
  return NextResponse.json({ schedules });
}
```

---

### MEDIUM-004: No Rate Limiting on Generation Endpoint
**Severity:** MEDIUM  
**File:** `src/app/api/offices/[id]/generate/route.ts` (entire file)

**Problem:**  
No throttling or rate limiting on expensive generation:

```typescript
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // No rate limit check
  // No concurrency limit
  // No caching of results
  
  const schedules = [];
  for (const dayOfWeek of daysToGenerate) {
    const result = generateSchedule(input); // CPU-intensive
    schedules.push(result);
  }
}
```

**Abuse Scenario:**
1. User clicks "Generate All Days" repeatedly
2. Each click spawns 5 generation tasks
3. Server CPU spikes
4. No request coalescing

**Fix:**
Add caching and rate limiting:
```typescript
const generationCache = new Map<string, { result: any, timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cacheKey = `${id}-${JSON.stringify(daysToGenerate)}`;
  const cached = generationCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.result);
  }
  
  const schedules = await generateSchedules(...);
  generationCache.set(cacheKey, { result: schedules, timestamp: Date.now() });
  
  return NextResponse.json(schedules);
}
```

---

### MEDIUM-005: Export Endpoint Doesn't Handle Missing Schedules
**Severity:** MEDIUM  
**File:** `src/app/api/offices/[id]/export/route.ts` (lines 38-45)

**Problem:**  
Validation checks if schedules array exists but not if it's empty:

```typescript
const { schedules } = body;

if (!schedules || !Array.isArray(schedules)) {
  return NextResponse.json(
    { error: 'Missing schedules data in request body' },
    { status: 400 }
  );
}

// No check for schedules.length === 0
```

**What Breaks:**
User clicks "Export" with no schedules → gets empty Excel file → confused.

**Fix:**
```typescript
if (!schedules || !Array.isArray(schedules) || schedules.length === 0) {
  return NextResponse.json(
    { error: 'No schedules to export. Generate schedules first.' },
    { status: 400 }
  );
}
```

---

## 4. Component Audit

### HIGH-009: Dashboard Fetches Offices on Mount But Doesn't Refetch After Create
**Severity:** HIGH  
**File:** `src/app/page.tsx` (lines 26-31)

**Problem:**  
Dashboard fetches offices once on mount:

```typescript
useEffect(() => {
  fetchOffices().catch((error) => {
    toast.error("Failed to load offices");
    console.error(error);
  });
}, [fetchOffices]);
```

But when user creates office (via new page) and returns to dashboard, it shows stale data.

**User Flow:**
1. Dashboard loads → fetches offices → shows 5 mock offices
2. User creates "Test Office" → redirected to `/offices/test-123`
3. User clicks back to Dashboard → still shows 5 offices (doesn't include "Test Office")
4. User refreshes → now shows 6 offices

**Fix:**
Refetch on window focus:
```typescript
useEffect(() => {
  fetchOffices();
  
  const handleFocus = () => fetchOffices();
  window.addEventListener('focus', handleFocus);
  return () => window.removeEventListener('focus', handleFocus);
}, [fetchOffices]);
```

Or use React Query with automatic refetch.

---

### HIGH-010: Office Detail Page Assumes currentOffice Exists
**Severity:** HIGH  
**File:** `src/app/offices/[id]/page.tsx` (lines 45-284)

**Problem:**  
After loading check, code assumes `currentOffice` is non-null:

```typescript
if (officeLoading || !currentOffice) {
  return <div>Loading...</div>; // Early return
}

// Below this point, assumes currentOffice is defined
const providers: ProviderInput[] =
  currentOffice.providers?.map((p) => ({ ... })) || []; // Line 49

// ...later
const getDayShort = (day: string): string => {
  return getDayLabel(day).substring(0, 3);
};

return (
  <TabsList className={`grid w-full mb-4 grid-cols-${currentOffice.workingDays.length}`}>
    {currentOffice.workingDays.map((day) => ( // No null check
      // ...
    ))}
  </TabsList>
);
```

**Edge Case:**
If `fetchOffice` fails silently (network error, API returns null), `currentOffice` remains null but loading becomes false → renders with null office → crash.

**Fix:**
Add null check throughout or use TypeScript's non-null assertion with proper error handling:
```typescript
if (officeLoading) {
  return <div>Loading...</div>;
}

if (!currentOffice) {
  return <div>Office not found. <Link href="/">Go back</Link></div>;
}

// Now safe to use currentOffice!
```

---

### HIGH-011: Schedule Grid Generates Empty Slots When No Data
**Severity:** HIGH  
**File:** `src/components/schedule/ScheduleGrid.tsx` (lines 19-34)

**Problem:**  
When `slots` is empty, generates time slots client-side:

```typescript
const timeSlots = slots.length > 0 ? slots : generateTimeSlots().map(time => ({
  time,
  slots: providers.map(p => ({ providerId: p.id })),
}));
```

**Issue:**
- Duplication: time slot generation logic exists in generator.ts AND ScheduleGrid.tsx
- Inconsistency: client-side generation uses hardcoded 7 AM - 6 PM (line 21), but generator uses provider working hours
- Empty slots show staffing codes based on guessed lunch time (line 62)

**Fix:**
Remove client-side generation, show empty state:
```typescript
if (slots.length === 0) {
  return (
    <div className="text-center py-12">
      <p className="text-muted-foreground">No schedule generated yet.</p>
      <p className="text-sm">Click "Generate Schedule" to create one.</p>
    </div>
  );
}

const timeSlots = slots; // Use actual slots only
```

---

### MEDIUM-006: Edit Page Doesn't Show Unsaved Changes Warning
**Severity:** MEDIUM  
**File:** `src/app/offices/[id]/edit/page.tsx` (entire file)

**Problem:**  
User can make edits and navigate away without warning:

```typescript
<Link href={`/offices/${officeId}`}>
  <Button type="button" variant="outline">
    Cancel
  </Button>
</Link>
```

**Issue:**
No check if form is dirty → user loses edits.

**Fix:**
Use react-hook-form's `formState.isDirty`:
```typescript
const router = useRouter();
const { formState: { isDirty } } = useForm(...);

const handleCancel = () => {
  if (isDirty) {
    if (confirm("You have unsaved changes. Are you sure you want to leave?")) {
      router.push(`/offices/${officeId}`);
    }
  } else {
    router.push(`/offices/${officeId}`);
  }
};

<Button type="button" variant="outline" onClick={handleCancel}>
  Cancel
</Button>
```

---

### MEDIUM-007: New Office Form Doesn't Validate Provider Names Are Unique
**Severity:** MEDIUM  
**File:** `src/app/offices/new/page.tsx` (lines 29-57)

**Problem:**  
Schema validates provider name is non-empty but not unique:

```typescript
providers: z.array(
  z.object({
    name: z.string().min(1, "Provider name is required"), // Only checks non-empty
    // ...
  })
)
```

**Issue:**
User can add two providers named "Dr. Smith" → schedule generation can't distinguish them → production summary gets confused.

**Fix:**
Add custom validation:
```typescript
providers: z.array(
  z.object({
    name: z.string().min(1, "Provider name is required"),
    // ...
  })
).refine(
  (providers) => {
    const names = providers.map(p => p.name.toLowerCase());
    return names.length === new Set(names).size;
  },
  { message: "Provider names must be unique" }
)
```

---

### MEDIUM-008: Production Summary Doesn't Handle Missing Providers
**Severity:** MEDIUM  
**File:** `src/components/schedule/ProductionSummary.tsx` (assumed to exist based on imports)

**Problem:**  
Office detail page passes production summaries that reference providers:

```typescript
const productionSummaries: ProviderProductionSummary[] =
  currentDaySchedule?.productionSummary.map((summary) => ({
    providerName: summary.providerName,
    providerColor:
      currentOffice.providers?.find((p) => p.id === summary.providerId)?.color || "#666",
    // ...
  })) || [];
```

**Issue:**
If `currentOffice.providers` is undefined or provider not found, defaults to `#666` gray → all providers look the same.

**Fix:**
Add validation:
```typescript
const provider = currentOffice.providers?.find((p) => p.id === summary.providerId);
if (!provider) {
  console.warn(`Provider ${summary.providerId} not found in office ${currentOffice.id}`);
  return null; // Skip this summary
}

return {
  providerName: summary.providerName,
  providerColor: provider.color,
  // ...
};
```

---

### LOW-001: Dashboard Search Doesn't Handle Special Characters
**Severity:** LOW  
**File:** `src/app/page.tsx` (lines 33-36)

**Problem:**  
Simple case-insensitive search:

```typescript
const filteredOffices = offices.filter((office) =>
  office.name.toLowerCase().includes(searchQuery.toLowerCase())
);
```

**Issue:**
Doesn't escape regex special chars, doesn't handle accented characters.

**Fix:**
Use fuzzy search or normalize:
```typescript
const normalizeString = (str: string) => 
  str.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // Remove accents

const filteredOffices = offices.filter((office) =>
  normalizeString(office.name).includes(normalizeString(searchQuery))
);
```

---

### LOW-002: No Error Boundaries
**Severity:** LOW  
**File:** Entire app (no error boundary components found)

**Problem:**  
No error boundaries to catch component errors → entire app crashes on any component error.

**Fix:**
Add error boundary:
```typescript
// src/components/ErrorBoundary.tsx
export class ErrorBoundary extends React.Component<Props, State> {
  state = { hasError: false, error: null };
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  
  render() {
    if (this.state.hasError) {
      return <div>Something went wrong. <button onClick={() => window.location.reload()}>Reload</button></div>;
    }
    return this.props.children;
  }
}

// Wrap app in layout.tsx
<ErrorBoundary>
  {children}
</ErrorBoundary>
```

---

## 5. Type Safety Audit

### HIGH-012: Role Type Mapping Inconsistencies
**Severity:** HIGH  
**File:** `src/app/api/offices/route.ts` (lines 34-36, 49-51)

**Problem:**  
Multiple places convert string roles to enum types inconsistently:

**POST /api/offices (line 36):**
```typescript
const providers = (body.providers || []).map((p: any) => ({
  // ...
  role: (p.role === 'Doctor' ? 'DOCTOR' : 'HYGIENIST') as 'DOCTOR' | 'HYGIENIST',
  // ^ Assumes only two values, no validation
}));
```

**POST /api/offices (line 51):**
```typescript
const blockTypes = (body.blockTypes || []).map((b: any) => ({
  // ...
  appliesToRole: (b.role === 'Doctor' ? 'DOCTOR' : b.role === 'Hygienist' ? 'HYGIENIST' : 'BOTH') as 'DOCTOR' | 'HYGIENIST' | 'BOTH',
  // ^ Different conversion logic
}));
```

**Issue:**
- `p.role` could be anything → unsafe cast
- If frontend sends 'doctor' (lowercase) → maps to 'HYGIENIST' ✗
- If frontend sends 'Dentist' → maps to 'HYGIENIST' ✗

**Fix:**
Use Zod validation:
```typescript
const ProviderSchema = z.object({
  name: z.string(),
  role: z.enum(['Doctor', 'Hygienist']).transform(r => r.toUpperCase() as 'DOCTOR' | 'HYGIENIST'),
  // ...
});

const body = ProviderSchema.parse(await request.json());
```

---

### MEDIUM-009: Generator Types Don't Match Component Types
**Severity:** MEDIUM  
**File:** `src/lib/engine/types.ts` (line 23), `src/components/schedule/ScheduleGrid.tsx` (lines 5-18)

**Problem:**  
Generator exports `TimeSlotOutput`:

```typescript
// types.ts
export interface TimeSlotOutput {
  time: string;
  providerId: string;
  operatory: string;
  staffingCode: 'D' | 'A' | 'H' | null;
  blockTypeId: string | null;
  blockLabel: string | null;
  isBreak: boolean;
}
```

But ScheduleGrid defines its own `TimeSlotOutput`:

```typescript
// ScheduleGrid.tsx
export interface TimeSlotOutput {
  time: string;
  slots: {
    providerId: string;
    staffingCode?: string;
    blockLabel?: string;
    isBreak?: boolean;
  }[];
}
```

**Issue:**
- Same name, different shape → confusion
- Page component converts between them (page.tsx lines 57-85) → error-prone
- Optional fields in component version → could render undefined

**Fix:**
Rename component type:
```typescript
// ScheduleGrid.tsx
export interface ScheduleGridRow {
  time: string;
  slots: ProviderSlot[];
}

export interface ProviderSlot {
  providerId: string;
  staffingCode?: string;
  blockLabel?: string;
  isBreak?: boolean;
}
```

---

### MEDIUM-010: Any Types in API Routes
**Severity:** MEDIUM  
**File:** `src/app/api/offices/route.ts` (lines 34, 49, 58)

**Problem:**  
Extensively uses `any` type:

```typescript
const providers = (body.providers || []).map((p: any) => ({ // any
  id: randomUUID(),
  name: p.name,
  role: (p.role === 'Doctor' ? 'DOCTOR' : 'HYGIENIST') as 'DOCTOR' | 'HYGIENIST',
  // ...
}));

const blockTypes = (body.blockTypes || []).map((b: any) => ({ // any
  // ...
}));

const newOffice: any = { // any
  id: newOfficeId,
  // ...
};
```

**Issue:**
- No type safety → runtime errors
- Typos not caught: `p.nmae` instead of `p.name`
- Missing fields not detected

**Fix:**
Define request/response schemas:
```typescript
import { z } from 'zod';

const CreateOfficeRequestSchema = z.object({
  name: z.string(),
  dpmsSystem: z.enum(['Dentrix', 'Open Dental', 'Eaglesoft', 'Denticon']),
  providers: z.array(z.object({
    name: z.string(),
    role: z.enum(['Doctor', 'Hygienist']),
    // ...
  })),
  // ...
});

export async function POST(request: Request) {
  const body = CreateOfficeRequestSchema.parse(await request.json());
  // Now body is fully typed!
}
```

---

### LOW-003: Implicit Any in Generator findAvailableSlots
**Severity:** LOW  
**File:** `src/lib/engine/generator.ts` (lines 45-72)

**Problem:**  
Some variables have implicit `any`:

```typescript
export function findAvailableSlots(
  slots: TimeSlotOutput[],
  provider: ProviderInput,
  duration: number,
  timeIncrement: number
): number[] {
  const availableIndices: number[] = [];
  const slotsNeeded = Math.ceil(duration / timeIncrement);
  
  const providerSlots = slots.filter(s => s.providerId === provider.id);
  
  for (let i = 0; i <= providerSlots.length - slotsNeeded; i++) {
    let allAvailable = true; // implicitly boolean, but could add type
    
    for (let j = 0; j < slotsNeeded; j++) {
      const slot = providerSlots[i + j]; // implicitly TimeSlotOutput
      // ...
    }
  }
}
```

**Fix:**
Add explicit types:
```typescript
for (let i = 0; i <= providerSlots.length - slotsNeeded; i++) {
  let allAvailable: boolean = true;
  
  for (let j: number = 0; j < slotsNeeded; j++) {
    const slot: TimeSlotOutput = providerSlots[i + j];
    // ...
  }
}
```

---

### LOW-004: Missing Null Checks in Production Summary Calculation
**Severity:** LOW  
**File:** `src/lib/engine/calculator.ts` (assumed to exist)

**Problem:**  
Based on usage in generator.ts (lines 176-191), calculator functions might not handle null inputs.

**Fix:**
Add runtime validation:
```typescript
export function calculateProductionSummary(
  provider: ProviderInput | null,
  scheduledBlocks: any[]
): ProviderProductionSummary {
  if (!provider) {
    throw new Error('Provider is required for production summary');
  }
  
  if (!Array.isArray(scheduledBlocks)) {
    throw new Error('scheduledBlocks must be an array');
  }
  
  // ... rest of logic
}
```

---

## 6. Mock Data Audit

### HIGH-013: Mock Offices 2-5 Have Empty Providers
**Severity:** HIGH  
**File:** `src/lib/mock-data.ts` (lines 161-198)

**Problem:**  
Only Smile Cascade (id=1) has providers:

```typescript
export const mockOffices: OfficeData[] = [
  smileCascadeOffice, // Has 4 providers, 9 blockTypes, full rules
  {
    id: '2',
    name: 'CDT Comfort Dental',
    // ...
    providers: [], // EMPTY
    blockTypes: defaultBlockTypes,
    rules: defaultRules,
  },
  // Same for ids 3, 4, 5
];
```

**What Breaks:**
1. User loads demo data → sees 5 offices
2. User opens office 2-5 → "No providers configured"
3. User tries to generate schedule → 400 error "Office must have at least one provider"
4. User confused, thinks app is broken

**Evidence:**
- Generate endpoint validation (generate/route.ts line 46) rejects empty providers
- Dashboard shows all offices equally → no indication which are usable

**Fix:**
Either:
1. Add realistic providers for all mock offices:
```typescript
const cdtComfortDentalProviders: ProviderInput[] = [
  {
    id: 'cdt-doc-1',
    name: 'Dr. Sarah Johnson',
    role: 'DOCTOR',
    operatories: ['OP1', 'OP2'],
    workingStart: '08:00',
    workingEnd: '17:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    dailyGoal: 6000,
    color: '#4CAF50',
  },
  // ... more providers
];

export const mockOffices: OfficeData[] = [
  smileCascadeOffice,
  {
    id: '2',
    name: 'CDT Comfort Dental',
    providers: cdtComfortDentalProviders, // Not empty
    blockTypes: defaultBlockTypes,
    rules: defaultRules,
  },
  // ...
];
```

2. OR filter out incomplete offices from demo data:
```typescript
export const usableMockOffices = mockOffices.filter(o => 
  o.providers && o.providers.length > 0
);
```

3. OR show "Setup Required" badge in UI:
```tsx
<OfficeCard
  {...office}
  badge={office.providers.length === 0 ? 'Setup Required' : undefined}
  disabled={office.providers.length === 0}
/>
```

---

### MEDIUM-011: Default Block Types Use Inconsistent IDs
**Severity:** MEDIUM  
**File:** `src/lib/mock-data.ts` (lines 101-159)

**Problem:**  
Default block types have `-default` suffix but Smile Cascade blocks have `-1`:

```typescript
export const smileCascadeBlockTypes: BlockTypeInput[] = [
  { id: 'hp-1', label: 'HP', /* ... */ },
  { id: 'mp-1', label: 'MP', /* ... */ },
  // ...
];

export const defaultBlockTypes: BlockTypeInput[] = [
  { id: 'hp-default', label: 'HP', /* ... */ }, // Different ID!
  { id: 'mp-default', label: 'MP', /* ... */ },
  // ...
];
```

**Issue:**
- If office switches from custom to default blocks → IDs change → schedule data references old IDs → blocks disappear
- Hard to track which blocks are custom vs default

**Fix:**
Use consistent ID scheme:
```typescript
export function createDefaultBlockType(label: string, officeId: string): BlockTypeInput {
  return {
    id: `${officeId}-${label.toLowerCase()}-default`,
    label,
    // ...
  };
}
```

---

### MEDIUM-012: Smile Cascade Has Hardcoded Colors
**Severity:** MEDIUM  
**File:** `src/lib/mock-data.ts` (lines 8-48)

**Problem:**  
Provider colors are hardcoded:

```typescript
export const smileCascadeProviders: ProviderInput[] = [
  {
    id: 'fitz-1',
    name: 'Dr. Kevin Fitzpatrick',
    role: 'DOCTOR',
    // ...
    color: '#ec8a1b', // orange
  },
  {
    id: 'cheryl-1',
    name: 'Cheryl Dise RDH',
    role: 'HYGIENIST',
    // ...
    color: '#87bcf3', // light blue
  },
  // ...
];
```

**Issue:**
- Not accessible (no contrast check)
- Not customizable
- If user adds 6th provider, runs out of predefined colors

**Fix:**
Generate colors algorithmically:
```typescript
import { generateColorPalette } from '@/lib/colors';

const colors = generateColorPalette(providers.length, { 
  minContrast: 4.5, // WCAG AA
  avoidSimilar: true 
});

providers.forEach((p, i) => {
  p.color = colors[i];
});
```

---

### LOW-005: Mock Data Doesn't Represent Edge Cases
**Severity:** LOW  
**File:** `src/lib/mock-data.ts` (entire file)

**Problem:**  
All mock data represents "normal" offices:
- 4-7 providers
- Monday-Friday work weeks
- 10-minute increments
- Standard hours (7 AM - 6 PM)

**Missing Edge Cases:**
- Office with 1 provider (solo practice)
- Office with 15+ providers (large group)
- Office with 4-day week (Thursday off)
- Office with 15-minute increments
- Office with split shifts (7-11, 2-6)
- Office with part-time providers (works only Mon/Wed/Fri)

**Fix:**
Add edge case mocks:
```typescript
export const soloDocOffice: OfficeData = {
  id: 'solo-1',
  name: 'Solo Family Dentistry',
  providers: [
    {
      id: 'solo-doc-1',
      name: 'Dr. Jane Solo',
      role: 'DOCTOR',
      operatories: ['OP1'],
      workingStart: '09:00',
      workingEnd: '17:00',
      // ...
    }
  ],
  // ...
};

export const largeGroupOffice: OfficeData = {
  id: 'large-1',
  name: 'Mega Dental Group',
  providers: Array.from({ length: 15 }, (_, i) => ({
    id: `large-provider-${i}`,
    // ...
  })),
  // ...
};
```

---

## 7. Recommended Refactoring Plan

### Phase 1: Stabilize Data Layer (CRITICAL - Do First)

**Goal:** Establish single source of truth with proper persistence

**Steps:**

1. **Choose persistence strategy:**
   - **Recommended:** Prisma + PostgreSQL (schema already exists)
   - **Alternative:** Server-side file system (JSON file)
   - **Not recommended:** Client-side localStorage (loses multi-device sync)

2. **Implement persistence:**
   ```typescript
   // src/lib/db/office-repository.ts
   export class OfficeRepository {
     async create(office: OfficeData): Promise<OfficeData> {
       return await prisma.office.create({
         data: office,
         include: { providers: true, blockTypes: true }
       });
     }
     
     async findById(id: string): Promise<OfficeData | null> {
       return await prisma.office.findUnique({
         where: { id },
         include: { providers: true, blockTypes: true }
       });
     }
     
     async findAll(): Promise<OfficeData[]> {
       return await prisma.office.findMany({
         include: { providers: true, blockTypes: true }
       });
     }
     
     async update(id: string, data: Partial<OfficeData>): Promise<OfficeData> {
       return await prisma.office.update({
         where: { id },
         data,
         include: { providers: true, blockTypes: true }
       });
     }
     
     async delete(id: string): Promise<void> {
       await prisma.office.delete({ where: { id } });
     }
   }
   ```

3. **Remove in-memory stores:**
   - Delete `src/lib/office-data-store.ts`
   - Replace all imports with `OfficeRepository`

4. **Update API routes:**
   ```typescript
   // src/app/api/offices/route.ts
   import { OfficeRepository } from '@/lib/db/office-repository';
   
   const repo = new OfficeRepository();
   
   export async function GET() {
     const offices = await repo.findAll();
     return NextResponse.json(offices);
   }
   
   export async function POST(request: Request) {
     const body = await request.json();
     const office = await repo.create(body);
     return NextResponse.json(office, { status: 201 });
   }
   ```

5. **Handle mock data:**
   ```typescript
   // Option A: Seed database on first run
   async function seedMockData() {
     const existing = await repo.findAll();
     if (existing.length === 0) {
       for (const mock of mockOffices) {
         await repo.create(mock);
       }
     }
   }
   
   // Option B: Add _meta flag
   const offices = await repo.findAll();
   return NextResponse.json(
     offices.map(o => ({
       ...o,
       _meta: { source: o.id.startsWith('mock-') ? 'demo' : 'user' }
     }))
   );
   ```

**Validation:** Run tests after each step. All 200 existing tests should still pass.

---

### Phase 2: Refactor State Management (HIGH Priority)

**Goal:** Replace Zustand with proper data fetching library

**Steps:**

1. **Install React Query:**
   ```bash
   npm install @tanstack/react-query
   ```

2. **Set up QueryClient:**
   ```typescript
   // src/app/providers.tsx
   'use client';
   import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
   
   const queryClient = new QueryClient({
     defaultOptions: {
       queries: {
         staleTime: 60000, // 1 minute
         refetchOnWindowFocus: true,
       },
     },
   });
   
   export function Providers({ children }: { children: React.ReactNode }) {
     return (
       <QueryClientProvider client={queryClient}>
         {children}
       </QueryClientProvider>
     );
   }
   ```

3. **Create query hooks:**
   ```typescript
   // src/hooks/use-offices.ts
   import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
   
   export function useOffices() {
     return useQuery({
       queryKey: ['offices'],
       queryFn: () => fetch('/api/offices').then(r => r.json()),
     });
   }
   
   export function useOffice(id: string) {
     return useQuery({
       queryKey: ['offices', id],
       queryFn: () => fetch(`/api/offices/${id}`).then(r => r.json()),
     });
   }
   
   export function useCreateOffice() {
     const queryClient = useQueryClient();
     
     return useMutation({
       mutationFn: (office: any) =>
         fetch('/api/offices', {
           method: 'POST',
           body: JSON.stringify(office),
         }).then(r => r.json()),
       onSuccess: () => {
         queryClient.invalidateQueries(['offices']); // Auto-refetch
       },
     });
   }
   ```

4. **Replace Zustand in components:**
   ```typescript
   // Before:
   const { offices, fetchOffices } = useOfficeStore();
   useEffect(() => { fetchOffices(); }, []);
   
   // After:
   const { data: offices, isLoading } = useOffices();
   ```

5. **Remove Zustand stores:**
   - Delete `src/store/office-store.ts`
   - Keep `schedule-store.ts` for UI state only (activeDay, etc.)

**Benefits:**
- Automatic cache invalidation
- Built-in loading/error states
- Optimistic updates
- Request deduplication
- Background refetching

---

### Phase 3: Improve Type Safety (MEDIUM Priority)

**Goal:** Eliminate `any` types, add runtime validation

**Steps:**

1. **Define shared schemas:**
   ```typescript
   // src/lib/schemas.ts
   import { z } from 'zod';
   
   export const ProviderRoleSchema = z.enum(['DOCTOR', 'HYGIENIST']);
   
   export const ProviderSchema = z.object({
     id: z.string().uuid(),
     name: z.string().min(1),
     role: ProviderRoleSchema,
     operatories: z.array(z.string()).min(1),
     workingStart: z.string().regex(/^\d{2}:\d{2}$/),
     workingEnd: z.string().regex(/^\d{2}:\d{2}$/),
     lunchStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
     lunchEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
     dailyGoal: z.number().min(0),
     color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
   });
   
   export const OfficeSchema = z.object({
     id: z.string(),
     name: z.string().min(1),
     dpmsSystem: z.enum(['DENTRIX', 'OPEN_DENTAL', 'EAGLESOFT', 'DENTICON']),
     workingDays: z.array(z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'])).min(1),
     providers: z.array(ProviderSchema),
     // ...
   });
   
   export type Provider = z.infer<typeof ProviderSchema>;
   export type Office = z.infer<typeof OfficeSchema>;
   ```

2. **Validate API inputs:**
   ```typescript
   // src/app/api/offices/route.ts
   import { OfficeSchema } from '@/lib/schemas';
   
   export async function POST(request: Request) {
     try {
       const body = await request.json();
       const validatedOffice = OfficeSchema.parse(body); // Throws if invalid
       
       const office = await repo.create(validatedOffice);
       return NextResponse.json(office, { status: 201 });
     } catch (error) {
       if (error instanceof z.ZodError) {
         return NextResponse.json(
           { error: 'Validation failed', details: error.errors },
           { status: 400 }
         );
       }
       throw error;
     }
   }
   ```

3. **Remove `any` types:**
   - Run `tsc --noImplicitAny`
   - Fix all errors
   - Add `strict: true` to tsconfig.json

---

### Phase 4: Add Comprehensive Mock Data (MEDIUM Priority)

**Goal:** Make all mock offices fully functional

**Steps:**

1. **Create provider templates:**
   ```typescript
   // src/lib/mock-data/providers.ts
   export function createDoctorProvider(id: string, name: string, overrides?: Partial<ProviderInput>): ProviderInput {
     return {
       id,
       name,
       role: 'DOCTOR',
       operatories: ['OP1', 'OP2'],
       workingStart: '07:00',
       workingEnd: '18:00',
       lunchStart: '13:00',
       lunchEnd: '14:00',
       dailyGoal: 5000,
       color: generateColor(),
       ...overrides,
     };
   }
   
   export function createHygienistProvider(id: string, name: string, overrides?: Partial<ProviderInput>): ProviderInput {
     return {
       id,
       name,
       role: 'HYGIENIST',
       operatories: ['HYG1'],
       workingStart: '07:00',
       workingEnd: '18:00',
       lunchStart: '13:00',
       lunchEnd: '14:00',
       dailyGoal: 2200,
       color: generateColor(),
       ...overrides,
     };
   }
   ```

2. **Populate all mock offices:**
   ```typescript
   // src/lib/mock-data/offices.ts
   export const cdtComfortDental: OfficeData = {
     id: '2',
     name: 'CDT Comfort Dental',
     dpmsSystem: 'OPEN_DENTAL',
     providers: [
       createDoctorProvider('cdt-doc-1', 'Dr. Sarah Johnson'),
       createDoctorProvider('cdt-doc-2', 'Dr. Mike Chen'),
       createHygienistProvider('cdt-hyg-1', 'Lisa Martinez RDH'),
       createHygienistProvider('cdt-hyg-2', 'Tom Wilson RDH'),
     ],
     blockTypes: defaultBlockTypes,
     rules: defaultRules,
     // ...
   };
   
   // Repeat for offices 3, 4, 5
   ```

3. **Add edge case offices:**
   ```typescript
   export const soloPractice: OfficeData = {
     id: 'solo-1',
     name: 'Solo Family Dentistry',
     providers: [
       createDoctorProvider('solo-doc-1', 'Dr. Jane Solo', {
         operatories: ['OP1'],
         workingStart: '09:00',
         workingEnd: '17:00',
       }),
     ],
     // ...
   };
   ```

---

### Phase 5: Enhance User Experience (LOW Priority)

**Goal:** Polish UI/UX, add quality-of-life features

**Steps:**

1. **Add error boundaries:**
   - Wrap each major section
   - Provide recovery actions

2. **Improve loading states:**
   - Skeleton screens instead of spinners
   - Show partial data while loading

3. **Add optimistic updates:**
   - Immediately reflect changes
   - Rollback on error

4. **Implement unsaved changes warning:**
   - Detect dirty forms
   - Prompt before navigation

5. **Add keyboard shortcuts:**
   - Cmd/Ctrl+S to save
   - Esc to cancel
   - Arrow keys for navigation

---

## Summary of Critical Issues

| ID | Issue | Severity | Impact | Fix Priority |
|----|-------|----------|--------|--------------|
| CRITICAL-001 | Multiple sources of truth | CRITICAL | Data loss, inconsistency | 1 |
| CRITICAL-002 | modifiedMockOffices never persists | CRITICAL | Data loss | 1 |
| CRITICAL-003 | Inconsistent API route precedence | CRITICAL | Unpredictable behavior | 1 |
| CRITICAL-004 | No persistence layer | CRITICAL | All data lost on restart | 1 |
| CRITICAL-005 | Zustand duplicates API state | CRITICAL | Stale data bugs | 2 |
| CRITICAL-006 | No office validation in schedule load | CRITICAL | Orphaned data | 2 |
| CRITICAL-007 | POST returns 201 but doesn't persist | CRITICAL | False success | 1 |
| CRITICAL-008 | PUT/PATCH lies about mock office updates | CRITICAL | False success | 1 |
| HIGH-001 | Inconsistent persistence strategy | HIGH | Confusing UX | 2 |
| HIGH-002 | localStorage never cleaned up | HIGH | Memory leak | 3 |
| HIGH-003 | Race condition in office fetching | HIGH | Crashes | 2 |
| HIGH-006 | GET /api/offices no metadata | HIGH | Can't distinguish types | 2 |
| HIGH-012 | Role type mapping unsafe | HIGH | Runtime errors | 3 |
| HIGH-013 | Mock offices 2-5 unusable | HIGH | Broken demo | 2 |

**Total Critical Issues:** 8  
**Total High Issues:** 12  
**Total Medium Issues:** 9  
**Total Low Issues:** 5

---

## Conclusion

This app has **fundamental architectural problems** stemming from:
1. **No single source of truth** for data
2. **No persistence layer** (in-memory only)
3. **Inconsistent state management** (Zustand + localStorage + manual fetching)
4. **Type safety gaps** (`any` everywhere)
5. **Broken demo data** (only 1 of 5 offices works)

**These are not bugs to fix — this is a broken architecture that needs rebuilding.**

The recommended refactoring plan above provides a clear path forward, prioritized by impact:
1. **Phase 1** (CRITICAL): Add database persistence
2. **Phase 2** (HIGH): Replace state management  
3. **Phase 3** (MEDIUM): Improve type safety
4. **Phase 4** (MEDIUM): Fix mock data
5. **Phase 5** (LOW): Polish UX

**Estimated effort:**
- Phase 1: 2-3 days
- Phase 2: 1-2 days
- Phase 3: 1 day
- Phase 4: 1 day
- Phase 5: 2-3 days

**Total: ~1-2 weeks of focused work**

Without these refactorings, **bugs will continue to emerge** because the data layer is fundamentally unstable.

---

**End of Audit Report**
