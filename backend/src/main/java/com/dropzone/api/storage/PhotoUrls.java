package com.dropzone.api.storage;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.domain.ProofRepository;
import com.dropzone.api.domain.ProofStatus;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

@Component
public class PhotoUrls {

	public static final String UNSPLASH_HOST = "images.unsplash.com";
	private static final String UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
	private static final Pattern UPLOAD = Pattern.compile("uploads/(" + UUID_PATTERN + ")/" + UUID_PATTERN + "\\.(jpg|png)");

	private final StorageService storage;
	private final ProofRepository proofs;

	public PhotoUrls(StorageService storage, ProofRepository proofs) {
		this.storage = storage;
		this.proofs = proofs;
	}

	public String ownUpload(UUID userId, String url, String field) {
		String clean = canonical(url);
		if (!isOwnUpload(userId, clean)) {
			throw ApiException.validation(field + " must be a photo you uploaded in the app");
		}
		return clean;
	}

	public String rewardImage(UUID userId, String url) {
		String clean = canonical(url);
		if (!isOwnUpload(userId, clean) && !isUnsplash(clean)) {
			throw ApiException.validation("rewardImageUrl must be a photo you uploaded in the app or an Unsplash photo");
		}
		return clean;
	}

	public String canonical(String url) {
		String clean = url == null ? "" : url.trim();
		int query = clean.indexOf('?');
		if (query < 0) {
			return clean;
		}
		String base = clean.substring(0, query);
		return objectName(base) != null ? base : clean;
	}

	public void requireUnusedProofPhoto(String url) {
		if (url != null && proofs.existsByPhotoUrlAndStatusNot(url, ProofStatus.WITHDRAWN)) {
			throw ApiException.validation("This photo was already used for another proof");
		}
	}

	public boolean isOwnUpload(UUID userId, String url) {
		UUID owner = owner(objectName(url));
		return owner != null && owner.equals(userId);
	}

	public String objectName(String url) {
		if (url == null) {
			return null;
		}
		String base = storage.publicUrl("");
		if (!url.startsWith(base)) {
			return null;
		}
		String name = url.substring(base.length());
		return UPLOAD.matcher(name).matches() ? name : null;
	}

	public static UUID owner(String objectName) {
		if (objectName == null) {
			return null;
		}
		Matcher matcher = UPLOAD.matcher(objectName);
		return matcher.matches() ? UUID.fromString(matcher.group(1)) : null;
	}

	public static boolean isUnsplash(String url) {
		try {
			URI uri = new URI(url);
			return "https".equals(uri.getScheme()) && UNSPLASH_HOST.equals(uri.getHost()) && uri.getRawUserInfo() == null
					&& uri.getPort() == -1;
		}
		catch (URISyntaxException e) {
			return false;
		}
	}
}
