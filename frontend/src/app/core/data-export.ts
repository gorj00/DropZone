import { Injectable, InjectionToken, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { ApiService } from './api/api.service';
import { localDate } from './stores';

export type ExportResult = 'saved' | 'shared' | 'cancelled';

export interface ExportBridge {
  native: boolean;
  fs: Pick<typeof Filesystem, 'writeFile'>;
  share: Pick<typeof Share, 'share'>;
}

export const EXPORT_BRIDGE = new InjectionToken<ExportBridge>('DataExport', {
  providedIn: 'root',
  factory: () => ({ native: Capacitor.isNativePlatform(), fs: Filesystem, share: Share })
});

export function exportFileName(name: string | null, today = localDate()): string {
  const clean = name?.replace(/[^\w.-]/g, '_').replace(/^\.+/, '');
  return clean || `dropzone-export-${today}.json`;
}

@Injectable({ providedIn: 'root' })
export class DataExportService {
  private readonly api = inject(ApiService);
  private readonly bridge = inject(EXPORT_BRIDGE);

  async download(): Promise<ExportResult> {
    const { json, filename } = await this.api.exportData();
    const name = exportFileName(filename);
    if (this.bridge.native) {
      const { uri } = await this.bridge.fs.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
      try {
        await this.bridge.share.share({ title: 'My DropZone data', files: [uri], dialogTitle: 'Save your DropZone data' });
        return 'shared';
      } catch (e) {
        if (/cancel|abort/i.test(String((e as Error)?.message ?? e))) return 'cancelled';
        throw e;
      }
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'saved';
  }
}
