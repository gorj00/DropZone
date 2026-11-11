package com.dropzone.api.common;

import com.dropzone.api.domain.Platform;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

public final class ClientPlatform {

	public static final String HEADER = "X-Platform";

	private ClientPlatform() {
	}

	public static Platform current() {
		if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes) {
			String value = attributes.getRequest().getHeader(HEADER);
			if (value != null) {
				for (Platform platform : Platform.values()) {
					if (platform.name().equalsIgnoreCase(value.trim())) {
						return platform;
					}
				}
			}
		}
		return Platform.ANDROID;
	}

	public static boolean ios() {
		return current() == Platform.IOS;
	}
}
