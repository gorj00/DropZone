package com.dropzone.api.storage;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

public interface StorageService {

	String upload(String objectName, byte[] data, String contentType);

	byte[] read(String objectName);

	String publicUrl(String objectName);

	String signedUrl(String objectName, Instant signedAt, Duration validFor);

	void delete(String objectName);

	void deletePrefix(String prefix);

	List<StoredObject> list(String prefix);

	record StoredObject(String name, Instant createdAt) {
	}
}
