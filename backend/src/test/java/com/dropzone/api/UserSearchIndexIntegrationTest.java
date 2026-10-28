package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.ResultSet;
import java.sql.Statement;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.ConnectionCallback;

class UserSearchIndexIntegrationTest extends IntegrationTest {

	@Test
	void userSearchUsesTrigramIndexesWhenPgTrgmIsAvailable() {
		assertThat(jdbc.queryForObject("select count(*) from pg_extension where extname = 'pg_trgm'", Integer.class)).isEqualTo(1);
		assertThat(jdbc.queryForList("select indexname from pg_indexes where tablename = 'users'", String.class))
				.contains("users_handle_trgm_idx", "users_display_name_trgm_idx");
		String plan = jdbc.execute((ConnectionCallback<String>) connection -> {
			try (Statement statement = connection.createStatement()) {
				statement.execute("set enable_seqscan = off");
				StringBuilder out = new StringBuilder();
				try (ResultSet rows = statement.executeQuery(
						"explain select id from users where lower(handle) like '%ann%' or lower(display_name) like '%ann%'")) {
					while (rows.next()) {
						out.append(rows.getString(1)).append('\n');
					}
				}
				statement.execute("reset enable_seqscan");
				return out.toString();
			}
		});
		assertThat(plan).contains("Bitmap Index Scan on users_handle_trgm_idx").contains("users_display_name_trgm_idx");
	}
}
