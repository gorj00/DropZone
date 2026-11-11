package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dropzone.api.config.RateLimitFilter;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

class RateLimitIntegrationTest extends IntegrationTest {

	@Test
	void everyBudgetIsListedInOnePlace() {
		assertThat(RateLimitFilter.BUDGETS).extracting(RateLimitFilter.Budget::name).containsExactly("sign-in", "uploads", "comments",
				"friend-requests", "friend-requests", "user-search", "user-search", "photo-search", "photo-search", "reports", "hypes");
		assertThat(RateLimitFilter.BUDGETS).extracting(RateLimitFilter.Budget::capacity).containsExactly(10, 30, 30, 20, 20, 60, 60, 20, 20, 20, 120);
	}

	@Test
	void signInIsLimitedPerClientIp() throws Exception {
		String subject = "sub-" + UUID.randomUUID();
		String email = "ratelimit-" + UUID.randomUUID().toString().substring(0, 8) + "@test.dev";
		String ip = "203.0.113." + (1 + (int) (Math.random() * 250));
		for (int i = 0; i < 10; i++) {
			googleAuth(google.token(subject, email, true, "Limited", null), ip).andExpect(status().isOk());
		}
		googleAuth(google.token(subject, email, true, "Limited", null), ip).andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"))
				.andExpect(jsonPath("$.status").value(429))
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"))
				.andExpect(jsonPath("$.message").value("Slow down a little — try again in a few minutes."));
		appleAuth(apple.token("apple-" + subject, email, true), null, ip).andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
		googleAuth(google.token(subject, email, true, "Limited", null), "198.51.100.9").andExpect(status().isOk());
	}

	@Test
	void userSearchIsLimitedPerUser() throws Exception {
		Session searcher = loginPro("Searcher");
		Session other = loginPro("OtherSearcher");
		for (int i = 0; i < 60; i++) {
			get(searcher, "/api/v1/social/search?q=zz").andExpect(status().isOk());
		}
		get(searcher, "/api/v1/social/search?q=zz").andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
		get(other, "/api/v1/social/search?q=zz").andExpect(status().isOk());
		get(searcher, "/api/v1/social/friends").andExpect(status().isOk());
	}

	@Test
	void uploadsAreLimitedBeforeTheFileIsRead() throws Exception {
		Session user = login("Uploader");
		for (int i = 0; i < 30; i++) {
			uploadPhoto(user);
		}
		upload(user, new MockMultipartFile("file", "proof.png", "image/png", png(8, 6))).andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
	}
}
