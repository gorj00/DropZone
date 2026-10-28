package com.dropzone.api.config;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.ServletException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestSizeFilterTest {

	private static MockHttpServletRequest chunked(int size) {
		MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/me/consent") {
			@Override
			public long getContentLengthLong() {
				return -1;
			}

			@Override
			public int getContentLength() {
				return -1;
			}
		};
		request.addHeader("Transfer-Encoding", "chunked");
		request.setContentType("application/json");
		request.setContent("x".repeat(size).getBytes(StandardCharsets.UTF_8));
		return request;
	}

	@Test
	void chunkedBodiesAreCountedAndKeptReadable() throws ServletException, IOException {
		AtomicReference<String> seen = new AtomicReference<>();
		MockHttpServletResponse response = new MockHttpServletResponse();
		new RequestSizeFilter().doFilter(chunked(100), response,
				(req, res) -> seen.set(new String(req.getInputStream().readAllBytes(), StandardCharsets.UTF_8)));
		assertThat(response.getStatus()).isEqualTo(200);
		assertThat(seen.get()).hasSize(100);
	}

	@Test
	void largeChunkedBodiesGet413() throws ServletException, IOException {
		MockHttpServletResponse response = new MockHttpServletResponse();
		new RequestSizeFilter().doFilter(chunked(RequestSizeFilter.MAX_BODY_BYTES + 1), response, (req, res) -> {
			throw new AssertionError("must not reach the app");
		});
		assertThat(response.getStatus()).isEqualTo(413);
	}
}
