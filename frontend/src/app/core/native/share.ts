import { Share } from '@capacitor/share';
import { environment } from '../../../environments/environment';

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

export async function shareOrCopy(data: { title: string; text: string; url: string }): Promise<ShareResult> {
  try {
    if ((await Share.canShare()).value) {
      await Share.share({ ...data, dialogTitle: data.title });
      return 'shared';
    }
  } catch (e) {
    if (/cancel|abort/i.test(String((e as Error)?.message ?? e))) return 'cancelled';
  }
  try {
    await navigator.clipboard.writeText(`${data.text} ${data.url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function proofLink(proofId: string): string {
  return `${new URL(environment.inviteBaseUrl).origin}/p/${proofId}`;
}
