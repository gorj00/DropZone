package com.dropzone.api.stats;

import com.dropzone.api.auth.CurrentUser;
import com.dropzone.api.common.Dtos.SlipUpDto;
import com.dropzone.api.common.Dtos.SlipUpTypeDto;
import com.dropzone.api.common.Dtos.StatsDto;
import com.dropzone.api.common.Requests;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class StatsController {

	private final StatsService stats;

	public StatsController(StatsService stats) {
		this.stats = stats;
	}

	@GetMapping("/stats")
	StatsDto stats(@CurrentUser UUID userId, @RequestParam(required = false) String month) {
		return stats.stats(userId, month);
	}

	@GetMapping("/slip-ups/types")
	List<SlipUpTypeDto> types(@CurrentUser UUID userId) {
		return stats.types(userId);
	}

	@PostMapping("/slip-ups/types")
	SlipUpTypeDto createType(@CurrentUser UUID userId, @Valid @RequestBody Requests.CreateSlipUpType req) {
		return stats.createType(userId, req);
	}

	@DeleteMapping("/slip-ups/types/{code}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void deleteType(@CurrentUser UUID userId, @PathVariable String code) {
		stats.deleteType(userId, code);
	}

	@PostMapping("/slip-ups")
	SlipUpDto log(@CurrentUser UUID userId, @Valid @RequestBody Requests.CreateSlipUp req) {
		return stats.logSlipUp(userId, req);
	}

	@GetMapping("/slip-ups")
	List<SlipUpDto> list(@CurrentUser UUID userId, @RequestParam(required = false) String date) {
		return stats.slipUpsOn(userId, date);
	}

	@DeleteMapping("/slip-ups/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@CurrentUser UUID userId, @PathVariable UUID id) {
		stats.deleteSlipUp(userId, id);
	}
}
