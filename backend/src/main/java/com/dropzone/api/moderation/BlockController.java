package com.dropzone.api.moderation;

import com.dropzone.api.auth.CurrentUser;
import com.dropzone.api.common.Dtos.UserSummary;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/blocks")
public class BlockController {

	private final BlockService blocks;

	public BlockController(BlockService blocks) {
		this.blocks = blocks;
	}

	@GetMapping
	List<UserSummary> list(@CurrentUser UUID userId) {
		return blocks.blocked(userId);
	}

	@PostMapping("/{targetId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void block(@CurrentUser UUID userId, @PathVariable UUID targetId) {
		blocks.block(userId, targetId);
	}

	@DeleteMapping("/{targetId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void unblock(@CurrentUser UUID userId, @PathVariable UUID targetId) {
		blocks.unblock(userId, targetId);
	}
}
