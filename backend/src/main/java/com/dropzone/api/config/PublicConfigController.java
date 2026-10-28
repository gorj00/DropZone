package com.dropzone.api.config;

import com.dropzone.api.common.Dtos.PublicConfigDto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PublicConfigController {

	private final AppProperties props;

	public PublicConfigController(AppProperties props) {
		this.props = props;
	}

	@GetMapping("/api/v1/config")
	PublicConfigDto config() {
		AppProperties.Legal legal = props.legal();
		return new PublicConfigDto(props.app().minVersionCode(), legal.termsVersion(), legal.privacyVersion(), blankToNull(legal.termsUrl()),
				blankToNull(legal.privacyUrl()), blankToNull(legal.deleteAccountUrl()));
	}

	private static String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}
}
