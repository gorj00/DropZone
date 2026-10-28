import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { dataUrlToBlob } from '../camera.service';

export type PhotoSource = 'gallery' | 'camera';

export async function pickPhoto(source: PhotoSource = 'gallery'): Promise<Blob | null> {
  try {
    const photo = await Camera.getPhoto({
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      resultType: CameraResultType.DataUrl,
      quality: 85,
      width: 1600
    });
    return photo.dataUrl ? dataUrlToBlob(photo.dataUrl) : null;
  } catch (e) {
    if (/cancel/i.test(String((e as Error)?.message ?? e))) return null;
    throw e;
  }
}
