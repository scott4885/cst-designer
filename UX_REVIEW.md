# UX/UI Quality Review - Schedule Template Designer

**Review Date:** February 13, 2026  
**Reviewer:** UX Quality Agent  
**App Version:** 1.0.0

---

## Executive Summary

This review covers all major user flows and components in the Schedule Template Designer app. Issues are categorized by severity:

- **BLOCKER** (4): Critical issues that break functionality or create terrible UX
- **MAJOR** (12): Significant problems that impact usability
- **MINOR** (8): Quality-of-life improvements
- **COSMETIC** (3): Polish and consistency issues

**Total Issues Found:** 27

---

## 🚨 BLOCKER Issues

### 1. No Error Boundaries Anywhere
**Flow:** All pages  
**What the user sees:** If any component crashes, the entire app goes blank with no error message  
**Expected behavior:** Graceful error UI with option to reload or go back  
**Severity:** BLOCKER  
**Suggested fix:**
```tsx
// Create src/components/ErrorBoundary.tsx
import React from 'react';
import { Button } from './ui/button';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen p-6">
          <div className="max-w-md space-y-4 text-center">
            <h2 className="text-2xl font-bold text-error">Something went wrong</h2>
            <p className="text-muted-foreground">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <Button onClick={() => window.location.reload()}>
              Reload Application
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```
Wrap the app in layout.tsx with `<ErrorBoundary>{children}</ErrorBoundary>`

---

### 2. Settings Page Values Never Applied
**Flow:** Settings → Save → Create new office  
**What the user sees:** Settings save successfully but default values (start time, lunch break, etc.) never actually apply when creating offices or providers  
**Expected behavior:** Saved settings should populate defaults in forms  
**Severity:** BLOCKER (feature is completely broken)  
**Suggested fix:**
```tsx
// In src/app/offices/new/page.tsx, load settings from localStorage:
useEffect(() => {
  const stored = localStorage.getItem("app-settings");
  if (stored) {
    const settings = JSON.parse(stored);
    // Apply settings to form defaults
    setValue("scheduleRules.timeIncrement", settings.timeIncrement || 15);
    // etc.
  }
}, [setValue]);
```

---

### 3. Office Edit Page Doesn't Refresh Office Store
**Flow:** Office detail → Edit → Save → Back to detail  
**What the user sees:** Changes are saved to API, but the office detail page shows stale data until full page reload  
**Expected behavior:** After saving, office store should refetch and UI should update immediately  
**Severity:** BLOCKER  
**Suggested fix:**
```tsx
// In src/app/offices/[id]/edit/page.tsx, after successful save:
const onSubmit = async (data: EditOfficeFormData) => {
  // ... save logic ...
  
  // Refetch office to update store
  await fetchOffice(officeId);
  
  toast.success("Office updated successfully!");
  router.push(`/offices/${officeId}`);
};
```

---

### 4. Generate All Days Can Still Freeze UI
**Flow:** Office detail → "Generate All Days"  
**What the user sees:** Despite the yielding setTimeout calls, generating 5+ days can still freeze the browser for 2-3 seconds with no feedback  
**Expected behavior:** Smooth, responsive generation with progress indicator  
**Severity:** BLOCKER (browser shows "Page Unresponsive" warning)  
**Suggested fix:**
```tsx
// Use Web Workers for schedule generation, or show a modal overlay:
<Dialog open={isGenerating && generatingDay !== null}>
  <DialogContent className="max-w-sm">
    <div className="space-y-4 text-center">
      <Loader2 className="w-12 h-12 animate-spin mx-auto text-accent" />
      <h3 className="text-lg font-semibold">Generating Schedules</h3>
      <p className="text-muted-foreground">
        Currently generating {getDayLabel(generatingDay)}...
      </p>
      <Progress value={(completedDays / totalDays) * 100} />
    </div>
  </DialogContent>
</Dialog>
```

---

## ⚠️ MAJOR Issues

### 5. No Confirmation on Delete Provider
**Flow:** Edit office → Click trash icon on provider  
**What the user sees:** Provider immediately deleted with no warning  
**Expected behavior:** Confirmation dialog: "Remove Dr. Smith? This cannot be undone."  
**Severity:** MAJOR  
**Suggested fix:**
```tsx
// Add confirmation dialog component or use browser confirm:
const handleDelete = (index: number) => {
  const provider = providerFields[index];
  if (confirm(`Remove ${provider.name}? This cannot be undone.`)) {
    removeProvider(index);
    toast.success('Provider removed');
  }
};
```

---

### 6. Form Doesn't Disable During Submission
**Flow:** New Office → Fill form → Click "Create Office"  
**What the user sees:** Button says "Create Office" but user can still edit form and click multiple times during API call  
**Expected behavior:** Form fields and buttons should disable during submission  
**Severity:** MAJOR (can cause duplicate submissions)  
**Suggested fix:**
```tsx
// Add isSubmitting state and disable form:
const [isSubmitting, setIsSubmitting] = useState(false);

const onSubmit = async (data: OfficeFormData) => {
  setIsSubmitting(true);
  try {
    // ... submission logic
  } finally {
    setIsSubmitting(false);
  }
};

// Disable all inputs:
<Input {...register("name")} disabled={isSubmitting} />
<Button type="submit" disabled={isSubmitting}>
  {isSubmitting ? "Creating..." : "Create Office"}
</Button>
```

---

### 7. No Real-Time Form Validation Feedback
**Flow:** New Office → Enter data in tabs  
**What the user sees:** No indication if form is valid until submission attempt  
**Expected behavior:** Show validation errors inline as user types/leaves field  
**Severity:** MAJOR  
**Suggested fix:**
```tsx
// Already using react-hook-form, just add validation mode:
const { register, formState: { errors, isDirty, isValid } } = useForm({
  resolver: zodResolver(officeSchema),
  mode: 'onBlur', // or 'onChange' for immediate feedback
});

// Show field-level errors under each input
```

---

### 8. Sidebar Navigation Broken
**Flow:** Click "Offices" in sidebar  
**What the user sees:** Link goes to /offices but that route doesn't exist (should go to /)  
**Expected behavior:** Dashboard and Offices should be the same page, or remove duplicate nav item  
**Severity:** MAJOR  
**Suggested fix:**
```tsx
// In src/components/layout/Sidebar.tsx, remove duplicate:
const navItems = [
  { href: "/", label: "Dashboard", icon: Home },
  // Remove: { href: "/offices", label: "Offices", icon: Building2 },
  { href: "/settings", label: "Settings", icon: Settings },
];
```

---

### 9. Export Button Unclear When Disabled
**Flow:** Office detail → No schedule generated → Export button grayed out  
**What the user sees:** Disabled button with no explanation  
**Expected behavior:** Tooltip or message explaining "Generate a schedule first to export"  
**Severity:** MAJOR  
**Suggested fix:**
```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button
      variant="outline"
      onClick={handleExport}
      disabled={Object.keys(generatedSchedules).length === 0 || isExporting}
    >
      <Download className="w-4 h-4 mr-2" />
      Export
    </Button>
  </TooltipTrigger>
  <TooltipContent>
    {Object.keys(generatedSchedules).length === 0 
      ? "Generate a schedule first" 
      : "Export all generated schedules to Excel"}
  </TooltipContent>
</Tooltip>
```

---

### 10. No Loading State on Dashboard
**Flow:** App load → Dashboard  
**What the user sees:** Blank screen for 200-500ms, then offices appear  
**Expected behavior:** Skeleton cards or spinner during fetch  
**Severity:** MAJOR  
**Suggested fix:**
```tsx
// Add loading skeletons:
{isLoading && (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {[...Array(3)].map((_, i) => (
      <Card key={i} className="animate-pulse">
        <CardHeader className="space-y-2">
          <div className="h-6 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-1/2" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-4 bg-muted rounded" />
          <div className="h-4 bg-muted rounded w-5/6" />
        </CardContent>
      </Card>
    ))}
  </div>
)}
```

---

### 11. Breadcrumbs Don't Match Page Titles
**Flow:** Navigate to any office  
**What the user sees:** Breadcrumb shows "Offices / Template Builder" but should show "Office Name"  
**Expected behavior:** Breadcrumbs should reflect actual navigation path with office names  
**Severity:** MAJOR  
**Suggested fix:**
```tsx
// In src/components/layout/Header.tsx:
// Pass office data as context or read from store
const { currentOffice } = useOfficeStore();

const generateBreadcrumbs = () => {
  if (pathname.includes('/offices/') && currentOffice) {
    if (pathname.includes('/edit')) {
      return `${currentOffice.name} / Edit`;
    }
    return currentOffice.name;
  }
  // ... rest of logic
};
```

---

### 12. No Cancel Confirmation on Forms
**Flow:** New Office → Fill 3 tabs → Click back button  
**What the user sees:** Immediately navigates away, losing all progress  
**Expected behavior:** "You have unsaved changes. Are you sure you want to leave?"  
**Severity:** MAJOR  
**Suggested fix:**
```tsx
// Use react-hook-form's isDirty:
const { formState: { isDirty } } = useForm();

const handleBack = (e: React.MouseEvent) => {
  if (isDirty) {
    e.preventDefault();
    if (confirm('You have unsaved changes. Leave anyway?')) {
      router.push('/');
    }
  }
};

<Button onClick={handleBack} variant="ghost">
  <ArrowLeft />
</Button>
```

---

### 13. Schedule Grid Empty State Confusing
**Flow:** Office detail → No schedule generated yet  
**What the user sees:** Empty grid with time slots and provider columns but no data  
**Expected behavior:** Large, clear empty state: "No schedule generated yet. Click Generate to create one."  
**Severity:** MAJOR  
**Suggested fix:**
```tsx
// In ScheduleGrid.tsx, add prominent empty state:
{slots.length === 0 && providers.length > 0 && (
  <div className="absolute inset-0 flex items-center justify-center bg-surface/90 backdrop-blur-sm">
    <div className="text-center space-y-4 max-w-sm p-8">
      <Sparkles className="w-16 h-16 mx-auto text-accent" />
      <h3 className="text-xl font-semibold">No Schedule Yet</h3>
      <p className="text-muted-foreground">
        Click "Generate {getDayLabel(activeDay)}" above to create an optimized schedule for this day.
      </p>
    </div>
  </div>
)}
```

---

### 14. Production Summary Shows Empty Cards
**Flow:** Office detail → No schedule generated  
**What the user sees:** Right panel shows "Production Summary" header but no content  
**Expected behavior:** Show message "Generate a schedule to see production metrics"  
**Severity:** MAJOR  
**Suggested fix:**
```tsx
// In ProductionSummary.tsx:
{summaries.length === 0 && (
  <Card>
    <CardContent className="py-12 text-center">
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm">
          Production metrics will appear here after generating a schedule
        </p>
      </div>
    </CardContent>
  </Card>
)}
```

---

### 15. Tab Navigation Loses Context
**Flow:** New Office → Tab 2 → Refresh page  
**What the user sees:** Form resets to Tab 1, losing place  
**Expected behavior:** Persist active tab in URL query param  
**Severity:** MAJOR  
**Suggested fix:**
```tsx
// Use URL search params for tab state:
const searchParams = useSearchParams();
const router = useRouter();
const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'practice');

const handleTabChange = (tab: string) => {
  setActiveTab(tab);
  router.replace(`?tab=${tab}`, { scroll: false });
};
```

---

### 16. API Error Messages Too Generic
**Flow:** Any API call fails  
**What the user sees:** Toast says "Failed to create office" with no details  
**Expected behavior:** Show specific error from API response  
**Severity:** MAJOR  
**Suggested fix:**
```tsx
// In all API handlers, parse error response:
try {
  const response = await fetch(...);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || error.message || 'Request failed');
  }
} catch (error) {
  toast.error(error instanceof Error ? error.message : 'Failed to create office');
}
```

---

## ➖ MINOR Issues

### 17. No Keyboard Shortcut Documentation
**Flow:** New Office form  
**What the user sees:** Cmd+S works but nowhere is this documented  
**Expected behavior:** Help tooltip or footer showing "⌘S to save"  
**Severity:** MINOR  
**Suggested fix:** Add small hint below form: `<p className="text-xs text-muted-foreground">Tip: Press ⌘S / Ctrl+S to save</p>`

---

### 18. Working Days Toggle Has No Visual Feedback
**Flow:** New Office → Toggle working days  
**What the user sees:** Button changes color but no toast/feedback  
**Expected behavior:** Subtle feedback or at least aria-label for screen readers  
**Severity:** MINOR  
**Suggested fix:** Add aria-pressed attribute and subtle animation on toggle

---

### 19. Provider Color Picker Small and Fiddly
**Flow:** New Office → Add provider → Pick color  
**What the user sees:** Tiny color input (16px × 10px)  
**Expected behavior:** Larger color swatch or color palette picker  
**Severity:** MINOR  
**Suggested fix:** Use a proper color picker library or increase input size to 32px × 32px

---

### 20. Time Format Inconsistent
**Flow:** Schedule grid vs form inputs  
**What the user sees:** Grid shows "1:00 PM", form shows "13:00"  
**Expected behavior:** Consistent format throughout (prefer 12-hour with AM/PM)  
**Severity:** MINOR  
**Suggested fix:** Convert all time inputs to 12-hour format or clearly label as 24-hour

---

### 21. No Office Delete Functionality
**Flow:** Dashboard → Want to delete demo office  
**What the user sees:** No way to delete offices  
**Expected behavior:** Delete option in office card menu or detail page  
**Severity:** MINOR  
**Suggested fix:** Add delete button in edit page with confirmation dialog

---

### 22. Demo Data Button Disappears
**Flow:** Dashboard → Load demo → Reload page  
**What the user sees:** "Load Demo Data" button gone permanently  
**Expected behavior:** Button should be available if <5 offices or in settings  
**Severity:** MINOR  
**Suggested fix:** Add "Reset Demo Data" in Settings or change condition to `offices.length < 3`

---

### 23. Schedule Grid Pagination Awkward
**Flow:** Office detail → Generated schedule → 66 time slots → Pagination  
**What the user sees:** Two sets of pagination controls (top and bottom) but time ranges are confusing  
**Expected behavior:** Single pagination with clearer time range labels: "Morning (7AM-11AM)"  
**Severity:** MINOR  
**Suggested fix:** Group by time periods instead of arbitrary 30-row chunks

---

### 24. Header Icons Not Functional
**Flow:** Click Settings icon in header  
**What the user sees:** Nothing happens  
**Expected behavior:** Should navigate to /settings or show dropdown  
**Severity:** MINOR  
**Suggested fix:**
```tsx
<Link href="/settings">
  <Button variant="ghost" size="icon">
    <Settings className="w-5 h-5" />
  </Button>
</Link>
```

---

## 🎨 COSMETIC Issues

### 25. Sidebar Logo Placeholder
**Flow:** Any page  
**What the user sees:** Generic "S" in a box  
**Expected behavior:** Proper logo or icon  
**Severity:** COSMETIC  
**Suggested fix:** Replace with actual logo or better placeholder like `<Calendar className="w-5 h-5" />`

---

### 26. Footer Version Number Not Useful
**Flow:** Sidebar footer  
**What the user sees:** "v1.0.0 - Internal Tool"  
**Expected behavior:** Either actual version or useful link (Help, GitHub, etc.)  
**Severity:** COSMETIC  
**Suggested fix:** Add actual version from package.json or link to documentation

---

### 27. Tab Labels Too Long on Mobile
**Flow:** New Office form on mobile  
**What the user sees:** Tab labels wrap or get truncated: "1. Practice Foundation" becomes "1. Pra..."  
**Expected behavior:** Responsive tab labels (hide numbers on mobile)  
**Severity:** COSMETIC  
**Suggested fix:**
```tsx
<TabsTrigger value="practice">
  <span className="hidden sm:inline">1. Practice Foundation</span>
  <span className="sm:hidden">Practice</span>
</TabsTrigger>
```

---

## 📋 Summary by Component

### Dashboard (page.tsx)
- ✅ Good: Empty state with demo data option
- ✅ Good: Loading state exists
- ❌ Issue #10: No skeleton loaders
- ❌ Issue #22: Demo button disappears

### New Office Form (offices/new/page.tsx)
- ✅ Good: Multi-tab organization
- ✅ Good: Keyboard shortcut (Cmd+S)
- ❌ Issue #2: Settings not applied
- ❌ Issue #6: No submission disable
- ❌ Issue #7: No real-time validation
- ❌ Issue #12: No cancel confirmation
- ❌ Issue #15: Tab state not persisted
- ❌ Issue #17: Keyboard shortcut not documented

### Office Detail (offices/[id]/page.tsx)
- ✅ Good: Three-panel layout
- ✅ Good: Day tabs with generation status indicators
- ❌ Issue #4: Generate All can freeze
- ❌ Issue #9: Export button unclear when disabled
- ❌ Issue #13: Schedule grid empty state confusing
- ❌ Issue #14: Production summary empty

### Edit Office (offices/[id]/edit/page.tsx)
- ❌ Issue #3: Doesn't refresh store after save
- ❌ Issue #5: No delete confirmation
- ❌ Issue #21: No delete office option

### Settings (settings/page.tsx)
- ❌ Issue #2: Settings never applied (BLOCKER)
- ✅ Good: Clear organization
- ✅ Good: Reset to defaults option

### Schedule Grid (ScheduleGrid.tsx)
- ✅ Good: Pagination for large datasets
- ❌ Issue #23: Pagination UX awkward
- ❌ Issue #13: Empty state not prominent

### Global Issues
- ❌ Issue #1: No error boundaries (BLOCKER)
- ❌ Issue #8: Sidebar navigation broken
- ❌ Issue #11: Breadcrumbs inaccurate
- ❌ Issue #16: Generic API errors
- ❌ Issue #24: Header icons non-functional

---

## 🚀 Recommended Priority Fix Order

1. **Add Error Boundaries** (Issue #1) - 30 min
2. **Fix Settings Application** (Issue #2) - 1 hour
3. **Refresh Store After Edit** (Issue #3) - 30 min
4. **Fix Generate All Freezing** (Issue #4) - 1 hour
5. **Add Delete Confirmations** (Issue #5) - 30 min
6. **Disable Forms During Submit** (Issue #6) - 30 min
7. **Fix Sidebar Navigation** (Issue #8) - 15 min
8. **Add Export Button Tooltip** (Issue #9) - 15 min
9. **Better Empty States** (Issues #13, #14) - 1 hour
10. **Real-time Validation** (Issue #7) - 1 hour
11. **Rest of fixes** - 4-6 hours

**Total Estimated Fix Time:** ~10-12 hours

---

## ✅ Things That Work Well

- Dark mode aesthetic (Linear/Obsidian vibe achieved)
- Toast notifications for user feedback
- Zustand state management structure
- Form validation with Zod schemas
- Responsive grid layouts
- Provider color coding
- Production summary calculations
- Excel export functionality
- Mock data system for demos
- Component organization and reusability

---

## 🔍 Testing Checklist

### Flow 1: New Office
- [ ] Fill all 4 tabs without errors
- [ ] Submit with missing required fields (should show validation)
- [ ] Submit successfully (should redirect to detail page)
- [ ] Providers should be visible on detail page
- [ ] Click back during form fill (should warn about unsaved changes)

### Flow 2: Edit Office
- [ ] Load office data correctly
- [ ] Modify provider name
- [ ] Save changes
- [ ] Return to detail page shows updated name
- [ ] Delete provider shows confirmation

### Flow 3: Generate Schedule
- [ ] Generate Monday - should show loading state
- [ ] Schedule should appear in grid immediately
- [ ] Generate All - should show progress without freezing
- [ ] Production summary should populate with correct values
- [ ] Switch tabs - schedule should persist

### Flow 4: Export
- [ ] Export button disabled when no schedules
- [ ] Export button shows tooltip explaining why
- [ ] After generation, export downloads Excel file
- [ ] Excel contains all generated days

### Flow 5: Navigation
- [ ] All breadcrumbs match current page
- [ ] Can get back from every page
- [ ] Sidebar highlights correct item
- [ ] Header icons work

### Flow 6: Empty States
- [ ] Dashboard shows helpful empty state
- [ ] Office with no providers shows guidance
- [ ] Schedule grid without generation shows clear CTA

### Flow 7: Error States
- [ ] Network error shows meaningful message
- [ ] Validation errors appear inline
- [ ] Component crash shows error boundary
- [ ] 404 on office shows error page

### Flow 8: Settings
- [ ] Changes save to localStorage
- [ ] Defaults apply in new office form
- [ ] Reset button works

---

**End of Review**
