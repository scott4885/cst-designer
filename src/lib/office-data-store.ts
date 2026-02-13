/**
 * Shared in-memory store for created offices
 * This ensures all API routes can access the same created offices
 */
import { OfficeData } from './mock-data';

export let createdOffices: OfficeData[] = [];

export function addOffice(office: OfficeData) {
  createdOffices.push(office);
}

export function getOfficeById(id: string): OfficeData | undefined {
  return createdOffices.find(o => o.id === id);
}

export function getAllCreatedOffices(): OfficeData[] {
  return createdOffices;
}

export function updateOffice(id: string, updates: Partial<OfficeData>): OfficeData | undefined {
  const index = createdOffices.findIndex(o => o.id === id);
  if (index === -1) return undefined;
  
  createdOffices[index] = {
    ...createdOffices[index],
    ...updates,
    id, // Preserve ID
    updatedAt: new Date().toISOString(),
  };
  
  return createdOffices[index];
}

export function deleteOffice(id: string): boolean {
  const index = createdOffices.findIndex(o => o.id === id);
  if (index === -1) return false;
  
  createdOffices.splice(index, 1);
  return true;
}
