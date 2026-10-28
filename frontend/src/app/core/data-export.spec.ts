import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Directory, Encoding } from '@capacitor/filesystem';
import { API_URL } from './api/api.service';
import { User } from './api/models';
import { authInterceptor } from './auth';
import { DataExportService, EXPORT_BRIDGE, exportFileName } from './data-export';
import { LockService } from './native/lock';
import { SessionStore } from './session.store';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const JSON_BODY = '{"profile":{"displayName":"Alex"}}';

async function setup(native: boolean, share = vi.fn().mockResolvedValue({})) {
  const fs = { writeFile: vi.fn().mockResolvedValue({ uri: 'file:///cache/dropzone-export-2026-10-28.json' }) };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: LockService, useValue: { native: false, disable: vi.fn().mockResolvedValue(undefined) } },
      { provide: EXPORT_BRIDGE, useValue: { native, fs, share: { share } } }
    ]
  });
  await TestBed.inject(SessionStore).signIn('tok', { id: 'u1', onboarded: true, theme: 'NEON', timezone: tz, lockedApps: [] } as unknown as User);
  return { service: TestBed.inject(DataExportService), http: TestBed.inject(HttpTestingController), fs, share };
}

const flushExport = async (http: HttpTestingController, filename: string | null = 'dropzone-export-2026-10-28.json') => {
  const req = await vi.waitFor(() => http.expectOne(`${API_URL}/me/export`));
  expect(req.request.method).toBe('GET');
  expect(req.request.headers.get('Authorization')).toBe('Bearer tok');
  req.flush(JSON_BODY, { headers: filename ? { 'Content-Disposition': `attachment; filename="${filename}"` } : {} });
};

describe('DataExportService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes the JSON to the cache and opens the share sheet on Android', async () => {
    const { service, http, fs, share } = await setup(true);
    const result = service.download();
    await flushExport(http);

    expect(await result).toBe('shared');
    expect(fs.writeFile).toHaveBeenCalledWith({ path: 'dropzone-export-2026-10-28.json', data: JSON_BODY, directory: Directory.Cache, encoding: Encoding.UTF8 });
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: ['file:///cache/dropzone-export-2026-10-28.json'] }));
  });

  it('treats a closed share sheet as cancelled', async () => {
    const { service, http } = await setup(true, vi.fn().mockRejectedValue(new Error('Share canceled')));
    const result = service.download();
    await flushExport(http);
    expect(await result).toBe('cancelled');
  });

  it('downloads a file in the browser', async () => {
    const created = vi.fn(() => 'blob:dropzone');
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('dropzone-export-2026-10-28.json');
      expect(this.href).toBe('blob:dropzone');
    });
    const { service, http, fs } = await setup(false);
    const result = service.download();
    await flushExport(http);

    expect(await result).toBe('saved');
    expect(click).toHaveBeenCalledTimes(1);
    expect(fs.writeFile).not.toHaveBeenCalled();
    const blob = (created.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.type).toBe('application/json');
    expect(await blob.text()).toBe(JSON_BODY);
  });

  it('names the file by date when the header is not readable', async () => {
    const { service, http, fs } = await setup(true);
    const result = service.download();
    await flushExport(http, null);
    await result;
    expect(fs.writeFile.mock.calls[0][0].path).toMatch(/^dropzone-export-\d{4}-\d{2}-\d{2}\.json$/);
  });
});

describe('exportFileName', () => {
  it('keeps safe names and strips path characters', () => {
    expect(exportFileName('dropzone-export-2026-10-28.json')).toBe('dropzone-export-2026-10-28.json');
    expect(exportFileName('../../evil.json')).toBe('_.._evil.json');
    expect(exportFileName(null, '2026-10-28')).toBe('dropzone-export-2026-10-28.json');
  });
});
