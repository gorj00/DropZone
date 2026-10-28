package com.dropzone.api.storage;

import tools.jackson.databind.util.StdConverter;

public class SignedPhotoUrl extends StdConverter<String, String> {

	private final PhotoSigner signer;

	public SignedPhotoUrl(PhotoSigner signer) {
		this.signer = signer;
	}

	@Override
	public String convert(String url) {
		return signer.sign(url);
	}
}
