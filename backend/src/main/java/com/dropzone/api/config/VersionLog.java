package com.dropzone.api.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.info.BuildProperties;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class VersionLog {

	private static final Logger log = LoggerFactory.getLogger(VersionLog.class);

	private final ObjectProvider<BuildProperties> build;
	private final Environment env;

	public VersionLog(ObjectProvider<BuildProperties> build, Environment env) {
		this.build = build;
		this.env = env;
	}

	@EventListener(ApplicationReadyEvent.class)
	public void started() {
		BuildProperties props = build.getIfAvailable();
		log.info("DropZone API started: version {}, commit {}, built {}", props == null ? "unknown" : props.getVersion(),
				env.getProperty("GIT_SHA", "unknown"), props == null ? "unknown" : props.getTime());
	}
}
