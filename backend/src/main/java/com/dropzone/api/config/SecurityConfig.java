package com.dropzone.api.config;

import com.dropzone.api.auth.JwtService;
import com.dropzone.api.auth.TokenVersionValidator;
import com.dropzone.api.common.Cursor;
import com.dropzone.api.jobs.JobController;
import com.dropzone.api.jobs.StatusController;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.nimbusds.jose.proc.SecurityContext;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

	private final AppProperties props;

	public SecurityConfig(AppProperties props) {
		this.props = props;
	}

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		AuthenticationEntryPoint entryPoint = (request, response, ex) -> {
			response.setStatus(HttpStatus.UNAUTHORIZED.value());
			response.setContentType(MediaType.APPLICATION_JSON_VALUE);
			response.getWriter().write("{\"status\":401,\"code\":\"UNAUTHORIZED\",\"message\":\"Authentication required\"}");
		};
		DefaultBearerTokenResolver defaultResolver = new DefaultBearerTokenResolver();
		BearerTokenResolver tokenResolver = request -> {
			String path = request.getRequestURI().substring(request.getContextPath().length());
			return path.startsWith("/api/v1/webhooks/") || path.startsWith("/api/v1/auth/") || path.equals("/api/v1/config")
					|| path.startsWith(JobController.PATH + "/") || path.equals(StatusController.PATH) ? null : defaultResolver.resolve(request);
		};
		http.csrf(c -> c.disable())
				.cors(Customizer.withDefaults())
				.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.authorizeHttpRequests(a -> a
						.requestMatchers("/api/v1/auth/**", "/api/v1/webhooks/**", "/api/v1/config", JobController.PATH + "/**", StatusController.PATH,
								"/actuator/health", "/actuator/health/**", "/error").permitAll()
						.anyRequest().authenticated())
				.oauth2ResourceServer(o -> o.bearerTokenResolver(tokenResolver).jwt(Customizer.withDefaults()).authenticationEntryPoint(entryPoint))
				.exceptionHandling(e -> e.authenticationEntryPoint(entryPoint));
		return http.build();
	}

	@Bean
	SecretKey jwtKey() {
		String secret = props.auth().jwtSecret() == null ? "" : props.auth().jwtSecret();
		byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
		if (bytes.length < 32) {
			throw new IllegalStateException("JWT_SECRET must be set and at least 32 bytes");
		}
		return new SecretKeySpec(bytes, "HmacSHA256");
	}

	@Bean
	JwtDecoder jwtDecoder(SecretKey jwtKey, TokenVersionValidator tokenVersion) {
		NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(jwtKey).macAlgorithm(MacAlgorithm.HS256).build();
		OAuth2TokenValidator<Jwt> standard = new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefaultWithIssuer(JwtService.ISSUER),
				new JwtClaimValidator<Collection<String>>(JwtClaimNames.AUD, aud -> aud != null && aud.contains(JwtService.AUDIENCE)));
		decoder.setJwtValidator(jwt -> {
			OAuth2TokenValidatorResult result = standard.validate(jwt);
			return result.hasErrors() ? result : tokenVersion.validate(jwt);
		});
		return decoder;
	}

	@Bean
	JwtEncoder jwtEncoder(SecretKey jwtKey) {
		return new NimbusJwtEncoder(new ImmutableSecret<SecurityContext>(jwtKey));
	}

	@Bean
	CorsConfigurationSource corsConfigurationSource() {
		CorsConfiguration config = new CorsConfiguration();
		config.setAllowedOrigins(props.cors().allowedOrigins());
		config.addAllowedMethod("*");
		config.addAllowedHeader("*");
		config.addExposedHeader(JwtService.REFRESH_HEADER);
		config.addExposedHeader(Cursor.HEADER);
		config.setMaxAge(3600L);
		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/**", config);
		return source;
	}
}
