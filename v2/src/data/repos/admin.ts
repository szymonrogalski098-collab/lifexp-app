// Whether the signed-in account is the bug-report admin. The rules decide (only the
// admin may list every report), so v2 asks the server instead of knowing who the
// admin is: no address in the code (the repository is public).
import { collection, getDocsFromServer, limit, query } from 'firebase/firestore';
import { db } from '../firebase';

/** True for the admin; false when the rules refuse; rejects when the server cannot be asked. */
export async function probeAdmin(): Promise<boolean> {
  try {
    await getDocsFromServer(query(collection(db, 'bugReports'), limit(1)));
    return true;
  } catch (error) {
    if ((error as { code?: string } | null)?.code === 'permission-denied') return false;
    throw error;
  }
}
