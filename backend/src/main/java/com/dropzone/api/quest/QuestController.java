package com.dropzone.api.quest;

import com.dropzone.api.auth.CurrentUser;
import com.dropzone.api.common.Dtos.QuestTypeDto;
import com.dropzone.api.common.Dtos.UserQuestDto;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/quests")
public class QuestController {

	private final QuestService quests;

	public QuestController(QuestService quests) {
		this.quests = quests;
	}

	@GetMapping("/catalog")
	List<QuestTypeDto> catalog() {
		return quests.catalog();
	}

	@GetMapping
	List<UserQuestDto> list(@CurrentUser UUID userId) {
		return quests.list(userId);
	}

	@PutMapping
	List<UserQuestDto> replace(@CurrentUser UUID userId, @Valid @RequestBody Requests.SetQuests req) {
		return quests.replace(userId, req.codes(), req.settings());
	}

	@PostMapping("/custom")
	UserQuestDto custom(@CurrentUser UUID userId, @Valid @RequestBody Requests.CustomQuest req) {
		return quests.createCustom(userId, req);
	}

	@PatchMapping("/{id}")
	UserQuestDto update(@CurrentUser UUID userId, @PathVariable UUID id, @Valid @RequestBody Requests.UpdateQuest req) {
		return quests.update(userId, id, req);
	}

	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@CurrentUser UUID userId, @PathVariable UUID id) {
		quests.delete(userId, id);
	}
}
