/**
 * Shared in-memory store for created offices
 * This ensures all API routes can access the same created offices
 */
import { OfficeData, mockOffices, defaultBlockTypes, defaultRules } from './mock-data';

export let createdOffices: OfficeData[] = [];

// Map to track which mock offices have been modified
const modifiedMockOffices = new Map<string, OfficeData>();

export function addOffice(office: OfficeData) {
  createdOffices.push(office);
}

export function getOfficeById(id: string): OfficeData | undefined {
  // Check if mock office was modified
  const modified = modifiedMockOffices.get(id);
  if (modified) return modified;
  
  // Check created offices
  const created = createdOffices.find(o => o.id === id);
  if (created) return created;
  
  // Fall back to mock offices
  return mockOffices.find(o => o.id === id);
}

export function getAllCreatedOffices(): OfficeData[] {
  return createdOffices;
}

export function updateOffice(id: string, updates: Partial<OfficeData>): OfficeData | undefined {
  // Check if it's a created office
  const createdIndex = createdOffices.findIndex(o => o.id === id);
  if (createdIndex !== -1) {
    // Auto-generate blockTypes and rules if providers are added but blockTypes/rules are missing
    const existingOffice = createdOffices[createdIndex];
    const hasProviders = updates.providers && updates.providers.length > 0;
    const needsBlockTypes = hasProviders && (!existingOffice.blockTypes || existingOffice.blockTypes.length === 0);
    const needsRules = hasProviders && !existingOffice.rules;
    
    createdOffices[createdIndex] = {
      ...existingOffice,
      ...updates,
      blockTypes: needsBlockTypes ? defaultBlockTypes : (updates.blockTypes || existingOffice.blockTypes),
      rules: needsRules ? defaultRules : (updates.rules || existingOffice.rules),
      id, // Preserve ID
      updatedAt: new Date().toISOString(),
    };
    
    return createdOffices[createdIndex];
  }
  
  // Check if it's a mock office
  const mockOffice = mockOffices.find(o => o.id === id);
  if (mockOffice) {
    // Auto-generate blockTypes and rules if providers are added but blockTypes/rules are missing
    const hasProviders = updates.providers && updates.providers.length > 0;
    const needsBlockTypes = hasProviders && (!mockOffice.blockTypes || mockOffice.blockTypes.length === 0);
    const needsRules = hasProviders && !mockOffice.rules;
    
    // Store modified version in the map
    const updatedOffice = {
      ...mockOffice,
      ...updates,
      blockTypes: needsBlockTypes ? defaultBlockTypes : (updates.blockTypes || mockOffice.blockTypes),
      rules: needsRules ? defaultRules : (updates.rules || mockOffice.rules),
      id, // Preserve ID
      updatedAt: new Date().toISOString(),
    };
    
    modifiedMockOffices.set(id, updatedOffice);
    return updatedOffice;
  }
  
  return undefined;
}

export function deleteOffice(id: string): boolean {
  const index = createdOffices.findIndex(o => o.id === id);
  if (index === -1) return false;
  
  createdOffices.splice(index, 1);
  return true;
}
