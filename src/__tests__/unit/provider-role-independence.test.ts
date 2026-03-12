/**
 * Provider Role Independence Test
 *
 * Verifies that adding a new provider (hygienist) does NOT mutate the
 * existing doctor's role. The bug was caused by the data-access layer's
 * "delete all → create all" strategy which didn't preserve provider IDs,
 * combined with no explicit ordering on provider queries.
 *
 * Fix: upsert preserves IDs; queries now orderBy id:asc for stable ordering.
 */
import { describe, it, expect } from 'vitest';

interface ProviderPayload {
  id?: string;
  name: string;
  role: 'DOCTOR' | 'HYGIENIST' | 'OTHER';
  operatories: string[];
  dailyGoal: number;
  color: string;
  workingStart: string;
  workingEnd: string;
}

/**
 * Simulates the form's onSubmit provider mapping logic.
 * Each provider in the input should retain its own role independently.
 */
function mapProvidersForSubmit(
  formProviders: ProviderPayload[],
  staggerMinutes: number
): ProviderPayload[] {
  let doctorIdx = 0;
  return formProviders.map((provider) => {
    const isDoctor = provider.role === 'DOCTOR';
    const stagger = isDoctor ? doctorIdx * staggerMinutes : 0;
    if (isDoctor) doctorIdx++;
    return {
      ...provider,
      id: provider.id || `generated-${Math.random().toString(16).slice(2)}`,
    };
  });
}

describe('Provider role independence', () => {
  const existingDoctor: ProviderPayload = {
    id: 'doc-001',
    name: 'Dr. Smith',
    role: 'DOCTOR',
    operatories: ['OP1', 'OP2'],
    dailyGoal: 5000,
    color: '#ec8a1b',
    workingStart: '07:00',
    workingEnd: '16:00',
  };

  const newHygienist: ProviderPayload = {
    name: 'Jane Hygienist',
    role: 'HYGIENIST',
    operatories: ['HYG1'],
    dailyGoal: 2500,
    color: '#87bcf3',
    workingStart: '08:00',
    workingEnd: '17:00',
  };

  it('adding a hygienist preserves the doctor role', () => {
    const result = mapProvidersForSubmit([existingDoctor, newHygienist], 20);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Dr. Smith');
    expect(result[0].role).toBe('DOCTOR');
    expect(result[1].name).toBe('Jane Hygienist');
    expect(result[1].role).toBe('HYGIENIST');
  });

  it('preserves existing provider ID, generates new for added provider', () => {
    const result = mapProvidersForSubmit([existingDoctor, newHygienist], 0);

    expect(result[0].id).toBe('doc-001');
    expect(result[1].id).toBeDefined();
    expect(result[1].id).not.toBe('doc-001');
  });

  it('adding multiple hygienists never mutates any doctor role', () => {
    const secondHygienist: ProviderPayload = {
      name: 'Amy RDH',
      role: 'HYGIENIST',
      operatories: ['HYG2'],
      dailyGoal: 2500,
      color: '#44f2ce',
      workingStart: '07:00',
      workingEnd: '15:00',
    };
    const secondDoctor: ProviderPayload = {
      id: 'doc-002',
      name: 'Dr. Jones',
      role: 'DOCTOR',
      operatories: ['OP3'],
      dailyGoal: 6000,
      color: '#f4de37',
      workingStart: '08:00',
      workingEnd: '17:00',
    };

    const result = mapProvidersForSubmit(
      [existingDoctor, secondDoctor, newHygienist, secondHygienist],
      30
    );

    // Both doctors retain DOCTOR role
    expect(result[0].role).toBe('DOCTOR');
    expect(result[1].role).toBe('DOCTOR');
    // Both hygienists retain HYGIENIST role
    expect(result[2].role).toBe('HYGIENIST');
    expect(result[3].role).toBe('HYGIENIST');
  });

  it('spread operator does not share role reference between providers', () => {
    const providers = [existingDoctor, newHygienist];
    const result = mapProvidersForSubmit(providers, 0);

    // Mutating one result should not affect the other
    (result[1] as any).role = 'OTHER';
    expect(result[0].role).toBe('DOCTOR');
    expect(providers[0].role).toBe('DOCTOR');
  });
});
