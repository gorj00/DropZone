package com.dropzone.api.storage;

import com.dropzone.api.auth.CurrentUser;
import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.UploadResponse;
import com.dropzone.api.user.UserService;
import java.io.IOException;
import java.util.UUID;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class UploadController {

	private static final long MAX_BYTES = 10L * 1024 * 1024;

	private final StorageService storage;
	private final UserService users;

	public UploadController(StorageService storage, UserService users) {
		this.storage = storage;
		this.users = users;
	}

	@PostMapping("/api/v1/uploads")
	UploadResponse upload(@CurrentUser UUID userId, @RequestParam("file") MultipartFile file) throws IOException {
		users.get(userId);
		if (file.isEmpty()) {
			throw ApiException.validation("File is empty");
		}
		if (file.getSize() > MAX_BYTES) {
			throw ApiException.validation("File too large (max 10 MB)");
		}
		ImageSanitizer.Image image = ImageSanitizer.sanitize(file.getBytes());
		String objectName = "uploads/" + userId + "/" + UUID.randomUUID() + "." + image.extension();
		return new UploadResponse(storage.upload(objectName, image.data(), image.contentType()));
	}
}
