package com.dropzone.api.today;

import com.dropzone.api.auth.CurrentUser;
import com.dropzone.api.common.Dtos.TodayDto;
import com.dropzone.api.common.Dtos.TodayQuestDto;
import com.dropzone.api.common.Dtos.WeighInDto;
import com.dropzone.api.common.Requests;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
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
public class TodayController {

	private final TodayService today;

	public TodayController(TodayService today) {
		this.today = today;
	}

	@GetMapping("/today")
	TodayDto today(@CurrentUser UUID userId, @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		return today.today(userId, date);
	}

	@PostMapping("/quests/{id}/complete")
	TodayQuestDto complete(@CurrentUser UUID userId, @PathVariable UUID id, @Valid @RequestBody Requests.CompleteQuest req) {
		return today.complete(userId, id, req);
	}

	@PostMapping("/weigh-ins")
	WeighInDto weighIn(@CurrentUser UUID userId, @Valid @RequestBody Requests.WeighIn req) {
		return today.weighIn(userId, req);
	}

	@DeleteMapping("/weigh-ins/{day}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void deleteWeighIn(@CurrentUser UUID userId, @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate day) {
		today.deleteWeighIn(userId, day);
	}
}
