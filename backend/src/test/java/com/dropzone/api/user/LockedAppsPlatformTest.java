package com.dropzone.api.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.ClientPlatform;
import com.dropzone.api.domain.Platform;
import com.dropzone.api.domain.User;
import java.time.Clock;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

class LockedAppsPlatformTest {

	private static final String YOUTUBE = "com.google.ios.youtube";
	private static final String TIKTOK = "com.zhiliaoapp.musically";

	private final UserService users = new UserService(null, null, null, null, null, Clock.systemUTC());

	@AfterEach
	void noRequest() {
		RequestContextHolder.resetRequestAttributes();
	}

	private static void requestFrom(String platform) {
		MockHttpServletRequest request = new MockHttpServletRequest();
		if (platform != null) {
			request.addHeader(ClientPlatform.HEADER, platform);
		}
		RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
	}

	private static User user(boolean pro, String... apps) {
		User user = new User();
		user.pro = pro;
		user.lockedApps.addAll(List.of(apps));
		return user;
	}

	private void proRequired(User user, List<String> apps, String message) {
		assertThatThrownBy(() -> users.applyLockedApps(user, apps)).isInstanceOfSatisfying(ApiException.class, e -> {
			assertThat(e.status()).isEqualTo(HttpStatus.PAYMENT_REQUIRED);
			assertThat(e.code()).isEqualTo("PRO_REQUIRED");
			assertThat(e.getMessage()).isEqualTo(message);
		});
	}

	@Test
	void platformComesFromTheHeaderAndIsNotIphoneWithoutARequest() {
		assertThat(ClientPlatform.current()).isEqualTo(Platform.ANDROID);
		assertThat(ClientPlatform.ios()).isFalse();
		requestFrom(null);
		assertThat(ClientPlatform.current()).isEqualTo(Platform.ANDROID);
		for (String ios : List.of("ios", "IOS", " iOS ")) {
			requestFrom(ios);
			assertThat(ClientPlatform.current()).isEqualTo(Platform.IOS);
			assertThat(ClientPlatform.ios()).isTrue();
		}
		requestFrom("web");
		assertThat(ClientPlatform.current()).isEqualTo(Platform.WEB);
		for (String other : List.of("android", "ipados", "")) {
			requestFrom(other);
			assertThat(ClientPlatform.current()).isEqualTo(Platform.ANDROID);
			assertThat(ClientPlatform.ios()).isFalse();
		}
	}

	@Test
	void freeIphoneUserLocksAnyOneApp() {
		requestFrom("ios");
		User free = user(false);
		users.applyLockedApps(free, List.of(" " + YOUTUBE + " ", YOUTUBE, " "));
		assertThat(free.lockedApps).containsExactly(YOUTUBE);
		assertThat(users.effectiveLockedApps(free)).containsExactly(YOUTUBE);

		proRequired(free, List.of(YOUTUBE, UserService.INSTAGRAM), "Locking more than one app is a PRO feature");
		assertThat(free.lockedApps).containsExactly(YOUTUBE);

		users.applyLockedApps(free, List.of(UserService.INSTAGRAM));
		assertThat(users.effectiveLockedApps(free)).containsExactly(UserService.INSTAGRAM);
		users.applyLockedApps(free, null);
		assertThat(users.effectiveLockedApps(free)).isEmpty();
	}

	@Test
	void exProIphoneUserKeepsInstagramOrTheFirstAppByName() {
		requestFrom("ios");
		assertThat(users.effectiveLockedApps(user(false, TIKTOK, YOUTUBE, "com.burbn.barcelona"))).containsExactly("com.burbn.barcelona");
		assertThat(users.effectiveLockedApps(user(false, TIKTOK, UserService.INSTAGRAM, "com.burbn.barcelona")))
				.containsExactly(UserService.INSTAGRAM);
		assertThat(users.effectiveLockedApps(user(true, TIKTOK, YOUTUBE, UserService.INSTAGRAM)))
				.containsExactly(TIKTOK, YOUTUBE, UserService.INSTAGRAM);

		User pro = user(true);
		users.applyLockedApps(pro, List.of(TIKTOK, YOUTUBE));
		assertThat(users.effectiveLockedApps(pro)).containsExactly(TIKTOK, YOUTUBE);
	}

	@Test
	void everyOtherPlatformKeepsTheInstagramOnlyRule() {
		instagramOnly();
		for (String platform : new String[] { null, "android", "web", "ipados" }) {
			requestFrom(platform);
			instagramOnly();
		}
	}

	private void instagramOnly() {
		User free = user(false, TIKTOK, UserService.INSTAGRAM, YOUTUBE);
		assertThat(users.effectiveLockedApps(free)).containsExactly(UserService.INSTAGRAM);
		assertThat(users.effectiveLockedApps(user(false, TIKTOK))).isEmpty();
		proRequired(free, List.of(YOUTUBE), "Locking apps other than Instagram is a PRO feature");
		proRequired(free, List.of(UserService.INSTAGRAM, YOUTUBE), "Locking apps other than Instagram is a PRO feature");
		assertThat(free.lockedApps).containsExactly(TIKTOK, UserService.INSTAGRAM, YOUTUBE);
		users.applyLockedApps(free, List.of(UserService.INSTAGRAM));
		assertThat(free.lockedApps).containsExactly(UserService.INSTAGRAM);

		User pro = user(true);
		users.applyLockedApps(pro, List.of(TIKTOK, YOUTUBE));
		assertThat(users.effectiveLockedApps(pro)).containsExactly(TIKTOK, YOUTUBE);
	}
}
