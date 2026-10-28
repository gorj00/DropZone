package com.dropzone.api.photo;

import com.dropzone.api.common.Dtos.PhotoDto;
import java.util.List;

public interface PhotoClient {

	List<PhotoDto> search(String query);

	void trackDownload(String photoId);
}
