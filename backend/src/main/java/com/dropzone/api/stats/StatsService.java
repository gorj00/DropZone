package com.dropzone.api.stats;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.SlipUpDto;
import com.dropzone.api.common.Dtos.SlipUpTypeDto;
import com.dropzone.api.common.Dtos.StatsDayDto;
import com.dropzone.api.common.Dtos.StatsDto;
import com.dropzone.api.common.Dtos.TopSlipUp;
import com.dropzone.api.common.Requests;
import com.dropzone.api.domain.DailyResult;
import com.dropzone.api.domain.DailyResultRepository;
import com.dropzone.api.domain.SlipUp;
import com.dropzone.api.domain.SlipUpRepository;
import com.dropzone.api.domain.SlipUpType;
import com.dropzone.api.domain.SlipUpTypeRepository;
import com.dropzone.api.domain.User;
import com.dropzone.api.progress.ProgressService;
import com.dropzone.api.rules.StatsCalculator;
import com.dropzone.api.rules.StreakCalculator;
import com.dropzone.api.user.UserService;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StatsService {

	private static final int TOP_SLIP_UPS = 3;
	private static final int MAX_CUSTOM_TYPES = 20;
	private static final int CUSTOM_SORT_BASE = 100;

	private final UserService users;
	private final DailyResultRepository dailyResults;
	private final SlipUpRepository slipUps;
	private final SlipUpTypeRepository slipUpTypes;
	private final ProgressService progress;
	private final Clock clock;

	public StatsService(UserService users, DailyResultRepository dailyResults, SlipUpRepository slipUps, SlipUpTypeRepository slipUpTypes,
			ProgressService progress, Clock clock) {
		this.users = users;
		this.dailyResults = dailyResults;
		this.slipUps = slipUps;
		this.slipUpTypes = slipUpTypes;
		this.progress = progress;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public StatsDto stats(UUID userId, String monthParam) {
		User user = users.get(userId);
		users.requirePro(user, "Stats");
		ZoneId zone = users.zone(user);
		LocalDate today = users.today(user);
		YearMonth month = parseMonth(monthParam, today);
		LocalDate first = month.atDay(1);
		LocalDate last = month.atEndOfMonth();
		LocalDate joined = LocalDate.ofInstant(user.createdAt, zone);

		Map<LocalDate, DailyResult> results = dailyResults.findByUserIdAndDayBetween(userId, first, last).stream()
				.collect(Collectors.toMap(r -> r.day, Function.identity()));
		List<SlipUp> monthSlipUps = slipUpsBetween(userId, first, last, zone);
		Map<LocalDate, Long> slipUpsByDay = monthSlipUps.stream()
				.collect(Collectors.groupingBy(s -> LocalDate.ofInstant(s.occurredAt, zone), Collectors.counting()));

		List<StatsDayDto> days = new ArrayList<>();
		Set<LocalDate> completeDays = new HashSet<>();
		int eligible = 0;
		int cleared = 0;
		int clean = 0;
		int questsDone = 0;
		for (LocalDate day = first; !day.isAfter(last); day = day.plusDays(1)) {
			boolean future = day.isAfter(today);
			DailyResult result = results.get(day);
			int slips = future ? 0 : slipUpsByDay.getOrDefault(day, 0L).intValue();
			int level = future || result == null ? 0 : StatsCalculator.level(result.doneCount, result.totalCount);
			days.add(new StatsDayDto(day, level, slips, future));
			if (future) {
				continue;
			}
			if (result != null) {
				questsDone += result.doneCount;
				if (result.complete()) {
					completeDays.add(day);
				}
			}
			if (day.isBefore(joined)) {
				continue;
			}
			eligible++;
			if (result != null && result.complete()) {
				cleared++;
				if (user.slipUpTracking && slips == 0) {
					clean++;
				}
			}
		}
		YearMonth previous = month.minusMonths(1);
		long previousCount = slipUpsBetween(userId, previous.atDay(1), previous.atEndOfMonth(), zone).size();
		Set<String> codes = monthSlipUps.stream().map(s -> s.type).collect(Collectors.toSet());
		Map<String, SlipUpType> types = codes.isEmpty() ? Map.of()
				: slipUpTypes.findAllById(codes).stream().collect(Collectors.toMap(t -> t.code, Function.identity()));
		List<TopSlipUp> top = monthSlipUps.stream().collect(Collectors.groupingBy(s -> s.type, Collectors.counting())).entrySet().stream()
				.sorted(Map.Entry.<String, Long>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
				.limit(TOP_SLIP_UPS)
				.map(e -> new TopSlipUp(e.getKey(), types.containsKey(e.getKey()) ? types.get(e.getKey()).name : e.getKey(), e.getValue()))
				.toList();
		int clearedPct = eligible == 0 ? 0 : (int) Math.round(cleared * 100.0 / eligible);
		return new StatsDto(month.toString(), days, clearedPct, StreakCalculator.best(completeDays, progress.restDays(user)), questsDone,
				monthSlipUps.size(),
				StatsCalculator.changePct(monthSlipUps.size(), previousCount), clean, top);
	}

	@Transactional(readOnly = true)
	public List<SlipUpTypeDto> types(UUID userId) {
		List<SlipUpType> all = new ArrayList<>(slipUpTypes.findByUserIdIsNullAndActiveTrueOrderBySortAsc());
		all.addAll(slipUpTypes.findByUserIdAndActiveTrueOrderBySortAsc(userId));
		return all.stream().map(StatsService::toDto).toList();
	}

	@Transactional
	public SlipUpTypeDto createType(UUID userId, Requests.CreateSlipUpType req) {
		User user = users.get(userId);
		users.requirePro(user, "Custom slip-ups");
		List<SlipUpType> own = slipUpTypes.findByUserIdAndActiveTrueOrderBySortAsc(userId);
		if (own.size() >= MAX_CUSTOM_TYPES) {
			throw ApiException.conflict("Too many custom slip-ups");
		}
		String name = req.name().trim();
		if (own.stream().anyMatch(t -> t.name.equalsIgnoreCase(name))) {
			throw ApiException.conflict("You already have that slip-up");
		}
		SlipUpType type = new SlipUpType();
		type.code = "U" + UUID.randomUUID().toString().replace("-", "").substring(0, 15).toUpperCase();
		type.name = name;
		type.icon = req.icon().trim();
		type.userId = userId;
		type.sort = CUSTOM_SORT_BASE + own.size();
		return toDto(slipUpTypes.save(type));
	}

	@Transactional
	public void deleteType(UUID userId, String code) {
		SlipUpType type = slipUpTypes.findByCodeAndUserIdAndActiveTrue(code.trim().toUpperCase(), userId)
				.orElseThrow(() -> ApiException.notFound("Slip-up type not found"));
		type.active = false;
	}

	@Transactional
	public SlipUpDto logSlipUp(UUID userId, Requests.CreateSlipUp req) {
		User user = users.get(userId);
		users.requirePro(user, "Slip-up tracking");
		String type = req.type().trim().toUpperCase();
		if (slipUpTypes.findById(type).filter(t -> t.usableBy(userId)).isEmpty()) {
			throw ApiException.validation("Unknown slip-up type " + type);
		}
		Instant now = clock.instant();
		Instant occurredAt = req.occurredAt() == null ? now : req.occurredAt();
		if (occurredAt.isAfter(now.plusSeconds(300))) {
			throw ApiException.validation("occurredAt is in the future");
		}
		SlipUp slipUp = new SlipUp();
		slipUp.id = UUID.randomUUID();
		slipUp.userId = userId;
		slipUp.type = type;
		slipUp.occurredAt = occurredAt;
		slipUp.note = req.note() == null || req.note().isBlank() ? null : req.note().trim();
		slipUp.createdAt = now;
		slipUps.save(slipUp);
		return toDto(slipUp, slipUpTypes.findById(type).orElse(null));
	}

	@Transactional(readOnly = true)
	public List<SlipUpDto> slipUpsOn(UUID userId, String dateParam) {
		User user = users.get(userId);
		ZoneId zone = users.zone(user);
		LocalDate day;
		try {
			day = dateParam == null || dateParam.isBlank() ? users.today(user) : LocalDate.parse(dateParam.trim());
		}
		catch (DateTimeParseException e) {
			throw ApiException.validation("date must be YYYY-MM-DD");
		}
		List<SlipUp> list = slipUpsBetween(userId, day, day, zone);
		Map<String, SlipUpType> types = slipUpTypes.findAllById(list.stream().map(s -> s.type).collect(Collectors.toSet())).stream()
				.collect(Collectors.toMap(t -> t.code, Function.identity()));
		return list.stream()
				.sorted((a, b) -> b.occurredAt.compareTo(a.occurredAt))
				.map(s -> toDto(s, types.get(s.type)))
				.toList();
	}

	@Transactional
	public void deleteSlipUp(UUID userId, UUID id) {
		SlipUp slipUp = slipUps.findById(id).filter(s -> s.userId.equals(userId))
				.orElseThrow(() -> ApiException.notFound("Slip-up not found"));
		slipUps.delete(slipUp);
	}

	private static SlipUpDto toDto(SlipUp s, SlipUpType type) {
		return new SlipUpDto(s.id, s.type, type == null ? s.type : type.name, type == null ? "flame" : type.icon, s.occurredAt, s.note);
	}

	private static SlipUpTypeDto toDto(SlipUpType t) {
		return new SlipUpTypeDto(t.code, t.name, t.icon, t.userId != null);
	}

	private List<SlipUp> slipUpsBetween(UUID userId, LocalDate first, LocalDate last, ZoneId zone) {
		return slipUps.findByUserIdAndOccurredAtGreaterThanEqualAndOccurredAtLessThan(userId, first.atStartOfDay(zone).toInstant(),
				last.plusDays(1).atStartOfDay(zone).toInstant());
	}

	private static YearMonth parseMonth(String value, LocalDate today) {
		if (value == null || value.isBlank()) {
			return YearMonth.from(today);
		}
		try {
			return YearMonth.parse(value.trim());
		}
		catch (DateTimeParseException e) {
			throw ApiException.validation("month must be YYYY-MM");
		}
	}
}
