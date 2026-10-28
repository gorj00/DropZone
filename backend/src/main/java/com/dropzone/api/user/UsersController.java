package com.dropzone.api.user;

import com.dropzone.api.auth.CurrentUser;
import com.dropzone.api.common.Dtos.HandleCheck;
import com.dropzone.api.common.Requests;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users")
public class UsersController {

	private final UserService users;

	public UsersController(UserService users) {
		this.users = users;
	}

	@GetMapping("/handle-available")
	HandleCheck handleAvailable(@CurrentUser UUID userId, @RequestParam String handle) {
		return users.checkHandle(userId, handle);
	}

	@PostMapping("/handle-available")
	HandleCheck handleAvailable(@CurrentUser UUID userId, @Valid @RequestBody Requests.HandleQuery req) {
		return users.checkHandle(userId, req.handle());
	}
}
