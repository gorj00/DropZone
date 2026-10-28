package com.dropzone.api.config;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.pattern.ThrowableProxyConverter;
import ch.qos.logback.classic.spi.ILoggingEvent;
import java.time.Instant;
import org.springframework.boot.logging.structured.JsonWriterStructuredLogFormatter;

public class GcpJsonLogFormatter extends JsonWriterStructuredLogFormatter<ILoggingEvent> {

	public GcpJsonLogFormatter(ThrowableProxyConverter throwableProxyConverter) {
		super(members -> {
			members.add("severity", ILoggingEvent::getLevel).as(GcpJsonLogFormatter::severity);
			members.add("message", event -> message(event, throwableProxyConverter));
			members.add("time", ILoggingEvent::getInstant).as(Instant::toString);
			members.add("logger", ILoggingEvent::getLoggerName);
			members.add("thread", ILoggingEvent::getThreadName);
		}, null);
	}

	static String severity(Level level) {
		return switch (level.toInt()) {
			case Level.ERROR_INT -> "ERROR";
			case Level.WARN_INT -> "WARNING";
			case Level.INFO_INT -> "INFO";
			default -> "DEBUG";
		};
	}

	private static String message(ILoggingEvent event, ThrowableProxyConverter converter) {
		String message = event.getFormattedMessage();
		if (event.getThrowableProxy() == null) {
			return message;
		}
		return message + "\n" + converter.convert(event);
	}
}
