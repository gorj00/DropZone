package com.dropzone.api.photo;

import com.dropzone.api.auth.CurrentUser;
import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.PhotoDto;
import com.dropzone.api.common.Requests;
import com.dropzone.api.user.UserService;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/photos")
public class PhotoController {

	private static final Pattern PHOTO_ID = Pattern.compile("[A-Za-z0-9_-]{1,64}");

	private final PhotoClient photos;
	private final UserService users;

	public PhotoController(PhotoClient photos, UserService users) {
		this.photos = photos;
		this.users = users;
	}

	@GetMapping("/search")
	List<PhotoDto> search(@CurrentUser UUID userId, @RequestParam("q") String q) {
		return find(userId, q);
	}

	@PostMapping("/search")
	List<PhotoDto> search(@CurrentUser UUID userId, @RequestBody Requests.Search req) {
		return find(userId, req.q());
	}

	private List<PhotoDto> find(UUID userId, String q) {
		users.get(userId);
		String term = q == null ? "" : q.trim();
		if (term.isEmpty() || term.length() > 100) {
			throw ApiException.validation("Search must be 1-100 characters");
		}
		return photos.search(term);
	}

	@PostMapping("/{id}/download")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void download(@CurrentUser UUID userId, @PathVariable String id) {
		users.get(userId);
		if (!PHOTO_ID.matcher(id).matches()) {
			throw ApiException.validation("Invalid photo id");
		}
		photos.trackDownload(id);
	}
}
