package com.dropzone.api.config;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.pattern.ThrowableProxyConverter;
import ch.qos.logback.classic.spi.LoggingEvent;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

class GcpJsonLogFormatterTest {

	private final LoggerContext context = new LoggerContext();

	private String format(Level level, String message, Throwable error) {
		ThrowableProxyConverter converter = new ThrowableProxyConverter();
		converter.setContext(context);
		converter.start();
		LoggingEvent event = new LoggingEvent("test", context.getLogger("com.dropzone.Test"), level, message, error, null);
		return new GcpJsonLogFormatter(converter).format(event);
	}

	@Test
	void writesOneJsonLineWithGcpSeverity() {
		String line = format(Level.WARN, "Careful", null);
		assertThat(line).endsWith("\n").doesNotContain("\n{");
		assertThat((String) JsonPath.read(line, "$.severity")).isEqualTo("WARNING");
		assertThat((String) JsonPath.read(line, "$.message")).isEqualTo("Careful");
		assertThat((String) JsonPath.read(line, "$.logger")).isEqualTo("com.dropzone.Test");
		assertThat((String) JsonPath.read(format(Level.DEBUG, "x", null), "$.severity")).isEqualTo("DEBUG");
	}

	@Test
	void stackTraceStaysInTheSameEntry() {
		String line = format(Level.ERROR, "Unexpected error", new IllegalStateException("boom"));
		assertThat(line.strip()).doesNotContain("\n");
		assertThat((String) JsonPath.read(line, "$.severity")).isEqualTo("ERROR");
		assertThat((String) JsonPath.read(line, "$.message")).startsWith("Unexpected error\njava.lang.IllegalStateException: boom")
				.contains("at com.dropzone.api.config.GcpJsonLogFormatterTest");
	}
}
