# Test Coverage Audit
**Date:** 2026-02-13  
**App:** Schedule Template Designer

---

## Current Test Coverage (Before Integration Tests)

### ✅ Unit Tests (64 tests) - ALL PASSING

**src/lib/engine/__tests__/calculator.test.ts** (16 tests)
- calculateTarget75
- calculateHourlyRate
- distributeBlockMinimums
- calculateProductionSummary

**src/lib/engine/__tests__/validator.test.ts** (16 tests)
- validateProviderInput
- validateBlockTypeInput
- validateScheduleRules
- validateGenerationInput

**src/lib/engine/__tests__/generator.test.ts** (22 tests)
- generateSchedule (basic flow)
- Provider scheduling logic
- Block type assignment
- Production calculation

**src/lib/export/__tests__/excel.test.ts** (10 tests)
- generateExcel
- Excel formatting
- Provider colors
- Production summaries

---

## ❌ CRITICAL GAPS (Pre-Integration Testing)

### 1. **No Data Store Tests**
- ❌ `addOffice()` - not tested
- ❌ `getOfficeById()` - not tested
- ❌ `updateOffice()` - not tested
- ❌ `deleteOffice()` - not tested
- ❌ `getAllCreatedOffices()` - not tested

**Risk:** Data store is the critical integration point that caused the original bug!

### 2. **No API Route Tests**
- ❌ GET /api/offices - not tested
- ❌ POST /api/offices - not tested
- ❌ GET /api/offices/[id] - not tested
- ❌ PUT /api/offices/[id] - not tested
- ❌ DELETE /api/offices/[id] - not tested
- ❌ POST /api/offices/[id]/generate - not tested
- ❌ POST /api/offices/[id]/export - not tested

**Risk:** The original bug was in these routes - they couldn't find newly created offices!

### 3. **No Integration Tests**
- ❌ Intake form → API → data store flow
- ❌ Create office → generate schedule → verify output
- ❌ Generate schedule → export to Excel → verify contents
- ❌ Edit office → verify it affects generation
- ❌ Edge cases (empty providers, invalid data, duplicates)

**Risk:** No end-to-end verification that the full user flow works!

---

## Test Plan

### Phase 1: Data Store Tests
Create `src/lib/__tests__/office-data-store.test.ts`
- Test all CRUD operations
- Test edge cases (non-existent IDs, empty data)
- Verify data persistence within session
- Test concurrent operations

### Phase 2: API Route Tests
Create `src/app/api/__tests__/` directory with:
- `offices.api.test.ts` - List and create offices
- `offices-id.api.test.ts` - Get, update, delete single office
- `generate.api.test.ts` - Schedule generation endpoint
- `export.api.test.ts` - Excel export endpoint

Each test file should cover:
- ✅ Success cases with mock offices
- ✅ Success cases with newly created offices
- ✅ Error cases (404, 400, 500)
- ✅ Validation of request/response format

### Phase 3: Integration Tests
Create `src/__tests__/integration/` directory with:
- `office-crud-flow.test.ts` - Complete CRUD cycle
- `intake-to-generation.test.ts` - Full intake form flow
- `generation-to-export.test.ts` - Generate → export flow
- `office-editing.test.ts` - Edit → regenerate flow
- `edge-cases.test.ts` - Error handling and edge cases

### Phase 4: Interoperability Tests
- Does editing an office update correctly for generation?
- Does the production calculator work with all provider/procedure combinations?
- Does Excel export match what the grid shows?
- Do schedule preferences actually affect generation output?

---

## Success Criteria

✅ **All existing 64 unit tests still pass**  
✅ **Data store has 100% coverage**  
✅ **All 7 API routes have comprehensive tests**  
✅ **Integration tests cover all critical user flows**  
✅ **Edge cases are tested and handled gracefully**  
✅ **The original bug (newly created offices not visible) would be caught**

Target: **150+ total tests** (64 existing + ~90 new)

---

## Next Steps

1. Write data store tests
2. Write API route tests
3. Write integration tests
4. Run full test suite
5. Fix any bugs discovered
6. Commit and push with clear messages
