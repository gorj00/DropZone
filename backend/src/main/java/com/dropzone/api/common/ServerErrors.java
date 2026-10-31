package com.dropzone.api.common;

import java.time.Clock;
import org.springframework.stereotype.Component;

@Component
public class ServerErrors extends RecentEvents {

	public ServerErrors(Clock clock) {
		super(clock);
	}
}
