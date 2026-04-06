import { db } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp,
} from 'firebase/firestore';

export interface CriteriaScore {
  criteriaId?: string;
  id?: string;
  name: string;
  weight: number;
  value: number;
}

export interface AssessmentDoc {
  id: string;
  employeeId: string;
  periodId: string;
  status: 'draft' | 'submitted' | 'scored';

  // kompatibilitas legacy
  employeeScores?: CriteriaScore[];
  employeScores?: CriteriaScore[]; // typo lama tetap disediakan
  employeeNote?: string;

  adminScores?: CriteriaScore[];
  finalScore?: number;
  adminNote?: string;

  createdAt?: any;
  updatedAt?: any;
}

type FinalAssessmentDoc = {
  id: string;
  karyawanId: string;
  periodeId: string;
  status: 'draft' | 'dikirim' | 'dinilai';
  nilaiKaryawan?: Record<string, number>;
  catatanKaryawan?: string;
  nilaiAdmin?: Record<string, number>;
  catatanAdmin?: string;
  totalNilai?: number;
  createdAt?: any;
  updatedAt?: any;
};

function sanitizeFirestorePayload<T extends Record<string, any>>(
  payload: T
): Partial<T> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

function buildDocId(employeeId: string, periodId: string) {
  return `${employeeId}_${periodId}`;
}

function clampScore(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, n));
}

function normalizeLegacyStatus(
  status?: string
): 'draft' | 'submitted' | 'scored' {
  if (status === 'scored' || status === 'dinilai') return 'scored';
  if (status === 'submitted' || status === 'dikirim') return 'submitted';
  return 'draft';
}

function normalizeFinalStatus(
  status?: string
): 'draft' | 'dikirim' | 'dinilai' {
  if (status === 'scored' || status === 'dinilai') return 'dinilai';
  if (status === 'submitted' || status === 'dikirim') return 'dikirim';
  return 'draft';
}

function makeScoreKey(score: CriteriaScore): string {
  const raw =
    score.criteriaId ||
    score.id ||
    score.name?.trim() ||
    `kriteria_${Math.random().toString(36).slice(2, 8)}`;

  return String(raw).trim();
}

function buildScoreMap(scores?: CriteriaScore[]): Record<string, number> {
  const result: Record<string, number> = {};

  for (const item of scores ?? []) {
    const key = makeScoreKey(item);
    result[key] = clampScore(item.value);
  }

  return result;
}

function calculateFinalScoreFromLegacyScores(scores?: CriteriaScore[]): number {
  let total = 0;

  for (const item of scores ?? []) {
    const bobot = Number(item.weight ?? 0);
    const nilai = clampScore(item.value);
    total += (nilai / 5) * bobot;
  }

  return Number(total.toFixed(2));
}

async function getCriteriaMeta(periodId: string) {
  const snap = await getDocs(
    query(collection(db, 'kriteria_penilaian'), where('periodeId', '==', periodId))
  );

  const map = new Map<string, { name: string; weight: number }>();

  snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .sort((a, b) => Number(a.urutan ?? 0) - Number(b.urutan ?? 0))
    .forEach((item) => {
      map.set(item.id, {
        name: String(item.namaKriteria ?? item.name ?? item.id),
        weight: Number(item.bobot ?? item.weight ?? 0),
      });
    });

  return map;
}

function scoreMapToLegacyArray(
  scoreMap: Record<string, number> | undefined,
  criteriaMeta: Map<string, { name: string; weight: number }>
): CriteriaScore[] {
  const entries = Object.entries(scoreMap ?? {});
  if (entries.length === 0) return [];

  return entries.map(([criteriaId, value]) => {
    const meta = criteriaMeta.get(criteriaId);

    return {
      criteriaId,
      id: criteriaId,
      name: meta?.name ?? criteriaId,
      weight: Number(meta?.weight ?? 0),
      value: clampScore(value),
    };
  });
}

function normalizeLegacyAssessment(
  raw: FinalAssessmentDoc,
  employeeScores: CriteriaScore[],
  adminScores: CriteriaScore[]
): AssessmentDoc {
  return {
    id: raw.id,
    employeeId: raw.karyawanId,
    periodId: raw.periodeId,
    status: normalizeLegacyStatus(raw.status),
    employeeScores,
    employeScores: employeeScores,
    employeeNote: String(raw.catatanKaryawan ?? ''),
    adminScores,
    finalScore:
      raw.totalNilai !== undefined && raw.totalNilai !== null
        ? Number(raw.totalNilai)
        : undefined,
    adminNote: String(raw.catatanAdmin ?? ''),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/**
 * Create draft assessment for employee in a period
 * COMPAT WRAPPER:
 * Data disimpan ke collection final `penilaian_kinerja`
 */
export async function createDraftAssessment(
  employeeId: string,
  periodId: string,
  payload?: Partial<AssessmentDoc>
): Promise<string> {
  try {
    const assessmentId = buildDocId(employeeId, periodId);
    const assessmentRef = doc(db, 'penilaian_kinerja', assessmentId);
    const existing = await getDoc(assessmentRef);

    if (existing.exists()) {
      return assessmentId;
    }

    const employeeScores = payload?.employeeScores ?? payload?.employeScores ?? [];
    const adminScores = payload?.adminScores ?? [];

    await setDoc(
      assessmentRef,
      sanitizeFirestorePayload({
        id: assessmentId,
        karyawanId: employeeId,
        periodeId: periodId,
        status: 'draft',
        nilaiKaryawan: buildScoreMap(employeeScores),
        nilaiAdmin: buildScoreMap(adminScores),
        catatanKaryawan: String(payload?.employeeNote ?? '').trim(),
        catatanAdmin: String(payload?.adminNote ?? '').trim(),
        ...(payload?.finalScore !== undefined
          ? { totalNilai: Number(payload.finalScore) }
          : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    return assessmentId;
  } catch (error) {
    console.error('Error creating draft assessment:', error);
    throw error;
  }
}

/**
 * Get assessment document by ID
 * COMPAT WRAPPER:
 * Ambil dari `penilaian_kinerja`, lalu dipetakan ke shape legacy
 */
export async function getAssessmentDoc(
  assessmentId: string
): Promise<AssessmentDoc | null> {
  try {
    const assessmentRef = doc(db, 'penilaian_kinerja', assessmentId);
    const snap = await getDoc(assessmentRef);

    if (!snap.exists()) return null;

    const raw = { id: snap.id, ...(snap.data() as any) } as FinalAssessmentDoc;
    const criteriaMeta = await getCriteriaMeta(raw.periodeId);

    const employeeScores = scoreMapToLegacyArray(raw.nilaiKaryawan, criteriaMeta);
    const adminScores = scoreMapToLegacyArray(raw.nilaiAdmin, criteriaMeta);

    return normalizeLegacyAssessment(raw, employeeScores, adminScores);
  } catch (error) {
    console.error('Error fetching assessment:', error);
    return null;
  }
}

/**
 * Get assessments for employee
 * Anti-index:
 * - jika periodId ada -> langsung get by docId
 * - jika tidak -> query satu where saja
 */
export async function getEmployeeAssessments(
  employeeId: string,
  periodId?: string
): Promise<AssessmentDoc[]> {
  try {
    if (periodId) {
      const single = await getAssessmentDoc(buildDocId(employeeId, periodId));
      return single ? [single] : [];
    }

    const q = query(
      collection(db, 'penilaian_kinerja'),
      where('karyawanId', '==', employeeId)
    );

    const snap = await getDocs(q);

    const docs = await Promise.all(
      snap.docs.map(async (d) => {
        const raw = { id: d.id, ...(d.data() as any) } as FinalAssessmentDoc;
        const criteriaMeta = await getCriteriaMeta(raw.periodeId);

        return normalizeLegacyAssessment(
          raw,
          scoreMapToLegacyArray(raw.nilaiKaryawan, criteriaMeta),
          scoreMapToLegacyArray(raw.nilaiAdmin, criteriaMeta)
        );
      })
    );

    return docs.sort((a, b) => {
      const aTime =
        a.updatedAt?.toDate?.()?.getTime?.() ??
        a.createdAt?.toDate?.()?.getTime?.() ??
        0;
      const bTime =
        b.updatedAt?.toDate?.()?.getTime?.() ??
        b.createdAt?.toDate?.()?.getTime?.() ??
        0;

      return bTime - aTime;
    });
  } catch (error) {
    console.error('Error fetching employee assessments:', error);
    return [];
  }
}

/**
 * Submit assessment
 * Legacy `submitted` -> final `dikirim`
 */
export async function submitAssessment(
  assessmentId: string,
  employeeScores: CriteriaScore[],
  employeeNote?: string
): Promise<void> {
  try {
    const assessmentRef = doc(db, 'penilaian_kinerja', assessmentId);
    const snap = await getDoc(assessmentRef);

    if (!snap.exists()) {
      throw new Error('Assessment not found');
    }

    const current = snap.data() as FinalAssessmentDoc;
    if (normalizeFinalStatus(current.status) !== 'draft') {
      throw new Error('Hanya draft yang bisa disubmit');
    }

    await updateDoc(
      assessmentRef,
      sanitizeFirestorePayload({
        nilaiKaryawan: buildScoreMap(employeeScores),
        catatanKaryawan: String(employeeNote ?? '').trim(),
        status: 'dikirim',
        updatedAt: serverTimestamp(),
      })
    );
  } catch (error) {
    console.error('Error submitting assessment:', error);
    throw error;
  }
}

/**
 * Set admin scores
 * Legacy `scored` -> final `dinilai`
 */
export async function setAdminScore(
  assessmentId: string,
  adminScores: CriteriaScore[],
  finalScore: number,
  adminNote?: string
): Promise<void> {
  try {
    const assessmentRef = doc(db, 'penilaian_kinerja', assessmentId);
    const snap = await getDoc(assessmentRef);

    if (!snap.exists()) {
      throw new Error('Assessment not found');
    }

    const safeFinalScore = Number.isFinite(finalScore)
      ? Number(finalScore)
      : calculateFinalScoreFromLegacyScores(adminScores);

    await updateDoc(
      assessmentRef,
      sanitizeFirestorePayload({
        nilaiAdmin: buildScoreMap(adminScores),
        totalNilai: Number(safeFinalScore.toFixed(2)),
        catatanAdmin: String(adminNote ?? '').trim(),
        status: 'dinilai',
        updatedAt: serverTimestamp(),
      })
    );
  } catch (error) {
    console.error('Error setting admin score:', error);
    throw error;
  }
}