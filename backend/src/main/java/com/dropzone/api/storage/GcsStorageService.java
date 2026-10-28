package com.dropzone.api.storage;

import com.dropzone.api.config.AppProperties;
import com.google.api.core.ApiClock;
import com.google.cloud.NoCredentials;
import com.google.cloud.storage.Blob;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.BucketInfo;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageException;
import com.google.cloud.storage.StorageOptions;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class GcsStorageService implements StorageService {

	public static final String CACHE_CONTROL = "private, max-age=3600";
	private static final Logger log = LoggerFactory.getLogger(GcsStorageService.class);
	private static final int DELETE_BATCH = 100;
	private static final ThreadLocal<Instant> SIGNED_AT = new ThreadLocal<>();
	private static final ApiClock SIGNING_CLOCK = new ApiClock() {
		@Override
		public long nanoTime() {
			return System.nanoTime();
		}

		@Override
		public long millisTime() {
			Instant at = SIGNED_AT.get();
			return at == null ? System.currentTimeMillis() : at.toEpochMilli();
		}
	};

	private final AppProperties.Storage props;
	private final AtomicBoolean bucketChecked = new AtomicBoolean();
	private volatile Storage storage;

	public GcsStorageService(AppProperties props) {
		this.props = props.storage();
	}

	@Override
	public String upload(String objectName, byte[] data, String contentType) {
		Storage client = client();
		ensureBucket(client);
		BlobInfo blob = BlobInfo.newBuilder(BlobId.of(props.bucket(), objectName))
				.setContentType(contentType)
				.setCacheControl(CACHE_CONTROL)
				.build();
		client.create(blob, data);
		return publicUrl(objectName);
	}

	@Override
	public byte[] read(String objectName) {
		return client().readAllBytes(BlobId.of(props.bucket(), objectName));
	}

	@Override
	public String publicUrl(String objectName) {
		return trimSlash(props.publicBaseUrl()) + "/" + objectName;
	}

	@Override
	public String signedUrl(String objectName, Instant signedAt, Duration validFor) {
		return emulated() ? null : sign(client(), props.bucket(), objectName, signedAt, validFor);
	}

	static String sign(Storage client, String bucket, String objectName, Instant signedAt, Duration validFor) {
		SIGNED_AT.set(signedAt);
		try {
			return client.signUrl(BlobInfo.newBuilder(BlobId.of(bucket, objectName)).build(), validFor.toSeconds(), TimeUnit.SECONDS,
					Storage.SignUrlOption.withV4Signature()).toString();
		}
		finally {
			SIGNED_AT.remove();
		}
	}

	static StorageOptions.Builder options() {
		return StorageOptions.newBuilder().setClock(SIGNING_CLOCK);
	}

	private boolean emulated() {
		return props.endpoint() != null && !props.endpoint().isBlank();
	}

	@Override
	public void delete(String objectName) {
		client().delete(BlobId.of(props.bucket(), objectName));
	}

	@Override
	public void deletePrefix(String prefix) {
		requirePrefix(prefix);
		Storage client = client();
		List<BlobId> ids = new ArrayList<>();
		for (Blob blob : client.list(props.bucket(), Storage.BlobListOption.prefix(prefix)).iterateAll()) {
			ids.add(blob.getBlobId());
		}
		for (int i = 0; i < ids.size(); i += DELETE_BATCH) {
			client.delete(ids.subList(i, Math.min(i + DELETE_BATCH, ids.size())));
		}
	}

	@Override
	public List<StoredObject> list(String prefix) {
		requirePrefix(prefix);
		List<StoredObject> objects = new ArrayList<>();
		for (Blob blob : client().list(props.bucket(), Storage.BlobListOption.prefix(prefix)).iterateAll()) {
			objects.add(new StoredObject(blob.getName(),
					blob.getCreateTimeOffsetDateTime() == null ? null : blob.getCreateTimeOffsetDateTime().toInstant()));
		}
		return objects;
	}

	private static void requirePrefix(String prefix) {
		if (prefix == null || prefix.isBlank() || !prefix.endsWith("/")) {
			throw new IllegalArgumentException("Prefix must be a folder");
		}
	}

	private Storage client() {
		if (storage == null) {
			synchronized (this) {
				if (storage == null) {
					StorageOptions.Builder builder = options();
					if (props.projectId() != null && !props.projectId().isBlank()) {
						builder.setProjectId(props.projectId());
					}
					if (emulated()) {
						builder.setHost(trimSlash(props.endpoint())).setCredentials(NoCredentials.getInstance());
					}
					storage = builder.build().getService();
				}
			}
		}
		return storage;
	}

	private void ensureBucket(Storage client) {
		if (!props.createBucket() || bucketChecked.get()) {
			return;
		}
		try {
			if (client.get(props.bucket()) == null) {
				client.create(BucketInfo.of(props.bucket()));
				log.info("Created bucket {}", props.bucket());
			}
			bucketChecked.set(true);
		}
		catch (StorageException e) {
			log.warn("Could not verify bucket {}: {}", props.bucket(), e.getMessage());
		}
	}

	private static String trimSlash(String value) {
		return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
	}
}
