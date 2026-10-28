import { Injectable, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { ApiService } from './api/api.service';
import { PhotoSource, pickPhoto } from './native/photos';
import { PromptService } from './prompt.service';
import { SessionStore } from './session.store';
import { ToastService } from './toast.service';

export async function squareJpeg(source: Blob, size = 512, quality = 0.9): Promise<Blob> {
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not read the photo.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not read the photo.'))), 'image/jpeg', quality)
    );
  } finally {
    bitmap.close();
  }
}

function pickFile(): Promise<Blob | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

@Injectable({ providedIn: 'root' })
export class AvatarService {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly prompt = inject(PromptService);
  private readonly toast = inject(ToastService);
  private readonly native = Capacitor.isNativePlatform();

  readonly busy = signal(false);

  async change(): Promise<void> {
    if (this.busy()) return;
    const hasPhoto = !!this.session.user()?.avatarUrl;
    const key = await this.prompt.choose('Profile photo', [
      ...(this.native ? [{ key: 'camera', label: 'Take a photo', icon: 'camera' }] : []),
      { key: 'gallery', label: this.native ? 'Choose from gallery' : 'Choose a photo', icon: 'image' },
      ...(hasPhoto ? [{ key: 'remove', label: 'Remove photo', icon: 'trash', danger: true }] : [])
    ]);
    if (!key) return;
    if (key === 'remove') {
      await this.remove();
      return;
    }
    try {
      const picked = this.native ? await pickPhoto(key as PhotoSource) : await pickFile();
      if (!picked) return;
      this.busy.set(true);
      const square = await squareJpeg(picked);
      const { url } = await this.api.upload(square, `avatar-${Date.now()}.jpg`);
      await this.session.update({ avatarUrl: url });
      this.toast.show('Profile photo updated.');
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  private async remove(): Promise<void> {
    const ok = await this.prompt.confirm('Remove profile photo?', 'Your initials will show instead.', 'Remove', 'Cancel');
    if (!ok) return;
    this.busy.set(true);
    try {
      await this.session.update({ avatarUrl: '' });
      this.toast.show('Profile photo removed.');
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
