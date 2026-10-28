package com.dropzone.api.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class RequestSizeFilter extends OncePerRequestFilter {

	public static final int MAX_BODY_BYTES = 64 * 1024;

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String contentType = request.getContentType();
		if (contentType != null && contentType.toLowerCase(Locale.ROOT).startsWith("multipart/")) {
			chain.doFilter(request, response);
			return;
		}
		long length = request.getContentLengthLong();
		if (length > MAX_BODY_BYTES) {
			reject(response);
			return;
		}
		if (length >= 0 || request.getHeader("Transfer-Encoding") == null) {
			chain.doFilter(request, response);
			return;
		}
		byte[] body = request.getInputStream().readNBytes(MAX_BODY_BYTES + 1);
		if (body.length > MAX_BODY_BYTES) {
			reject(response);
			return;
		}
		chain.doFilter(new CachedBodyRequest(request, body), response);
	}

	private static void reject(HttpServletResponse response) throws IOException {
		response.setStatus(HttpStatus.PAYLOAD_TOO_LARGE.value());
		response.setContentType(MediaType.APPLICATION_JSON_VALUE);
		response.getWriter().write("{\"status\":413,\"code\":\"VALIDATION\",\"message\":\"Request body is too large\"}");
	}

	private static final class CachedBodyRequest extends HttpServletRequestWrapper {

		private final byte[] body;

		CachedBodyRequest(HttpServletRequest request, byte[] body) {
			super(request);
			this.body = body;
		}

		@Override
		public ServletInputStream getInputStream() {
			ByteArrayInputStream in = new ByteArrayInputStream(body);
			return new ServletInputStream() {
				@Override
				public int read() {
					return in.read();
				}

				@Override
				public int read(byte[] b, int off, int len) {
					return in.read(b, off, len);
				}

				@Override
				public boolean isFinished() {
					return in.available() == 0;
				}

				@Override
				public boolean isReady() {
					return true;
				}

				@Override
				public void setReadListener(ReadListener listener) {
					throw new UnsupportedOperationException();
				}
			};
		}

		@Override
		public BufferedReader getReader() {
			String encoding = getCharacterEncoding();
			Charset charset = encoding == null ? StandardCharsets.UTF_8 : Charset.forName(encoding);
			return new BufferedReader(new InputStreamReader(getInputStream(), charset));
		}

		@Override
		public int getContentLength() {
			return body.length;
		}

		@Override
		public long getContentLengthLong() {
			return body.length;
		}
	}
}
