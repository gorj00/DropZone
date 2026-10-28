package com.dropzone.api.transformation;

import com.dropzone.api.auth.CurrentUser;
import com.dropzone.api.common.Dtos.TransformationDto;
import com.dropzone.api.common.Requests;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/transformations")
public class TransformationController {

	private final TransformationService transformations;

	public TransformationController(TransformationService transformations) {
		this.transformations = transformations;
	}

	@GetMapping
	List<TransformationDto> list(@CurrentUser UUID userId) {
		return transformations.list(userId);
	}

	@PostMapping
	TransformationDto create(@CurrentUser UUID userId, @Valid @RequestBody Requests.CreateTransformation req) {
		return transformations.create(userId, req);
	}

	@PatchMapping("/{id}")
	TransformationDto update(@CurrentUser UUID userId, @PathVariable UUID id, @Valid @RequestBody Requests.UpdateTransformation req) {
		return transformations.update(userId, id, req);
	}

	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@CurrentUser UUID userId, @PathVariable UUID id) {
		transformations.delete(userId, id);
	}
}
