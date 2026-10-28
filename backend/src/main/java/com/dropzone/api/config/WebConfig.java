package com.dropzone.api.config;

import com.dropzone.api.auth.CurrentUserResolver;
import com.dropzone.api.auth.SuspensionInterceptor;
import java.util.List;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

	private final CurrentUserResolver currentUserResolver;
	private final SuspensionInterceptor suspension;

	public WebConfig(CurrentUserResolver currentUserResolver, SuspensionInterceptor suspension) {
		this.currentUserResolver = currentUserResolver;
		this.suspension = suspension;
	}

	@Override
	public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
		resolvers.add(currentUserResolver);
	}

	@Override
	public void addInterceptors(InterceptorRegistry registry) {
		registry.addInterceptor(suspension).addPathPatterns("/api/v1/**");
	}
}
