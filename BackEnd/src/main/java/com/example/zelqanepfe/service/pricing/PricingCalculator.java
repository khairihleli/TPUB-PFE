package com.example.zelqanepfe.service.pricing;

import com.example.zelqanepfe.config.GeoPricingProperties;
import com.example.zelqanepfe.dto.PriceBreakdown;
import com.example.zelqanepfe.model.DiffusionSupport;
import com.example.zelqanepfe.model.Reservation;
import com.example.zelqanepfe.service.AvailabilityRules;
import com.example.zelqanepfe.service.TimeWindow;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

/**
 * Pure core of the dynamic pricing (docs/round2-contract.md §4.6). No I/O: the service feeds it the reservations and
 * the zone figures.
 *
 * <pre>
 * hour         = Σ_band (seconds of [st,et) ∩ band × band.multiplier) / seconds(st,et)
 * day          = mean over each date d in [sd,ed] of dayMultiplier(d.dayOfWeek)
 * demand       = 1 + demandWeight × (share × occS + (1 − share) × occZ)
 * scarcity     = 1 + scarcityWeight × (1 − availability)
 * raw          = hour × day × demand × scarcity        (each factor rounded to 4 decimals first)
 * multiplier   = round(clamp(min, max, raw), 4, HALF_UP)
 * finalCost    = round(base × multiplier, 2, HALF_UP)
 * </pre>
 */
public final class PricingCalculator {

    static final int FACTOR_SCALE = 4;
    private static final int SECONDS_PER_DAY = 24 * 3600;
    private static final Map<DayOfWeek, String> DAY_CODES = new EnumMap<>(Map.of(
            DayOfWeek.MONDAY, "LUNDI", DayOfWeek.TUESDAY, "MARDI", DayOfWeek.WEDNESDAY, "MERCREDI",
            DayOfWeek.THURSDAY, "JEUDI", DayOfWeek.FRIDAY, "VENDREDI", DayOfWeek.SATURDAY, "SAMEDI",
            DayOfWeek.SUNDAY, "DIMANCHE"));

    private PricingCalculator() {
    }

    /** A validated hour band, in seconds of the day ({@code end} may be 86400). */
    public record Band(int startSecond, int endSecond, BigDecimal multiplier, String label) {
    }

    public record HourFactor(BigDecimal factor, List<PriceBreakdown.HourBandDetail> bands) {
    }

    public record DayFactor(BigDecimal factor, List<PriceBreakdown.DayDetail> days) {
    }

    /** Reserved minutes over capacity minutes. */
    public record Occupancy(long reservedMinutes, long capacityMinutes) {

        public double ratio() {
            return capacityMinutes <= 0 ? 0 : Math.min(1, (double) reservedMinutes / capacityMinutes);
        }

        public Occupancy plus(Occupancy other) {
            return new Occupancy(reservedMinutes + other.reservedMinutes, capacityMinutes + other.capacityMinutes);
        }
    }

    public static String dayCode(DayOfWeek day) {
        return DAY_CODES.get(day);
    }

    // --- configuration -------------------------------------------------------------------------------------------

    /**
     * Parses and sorts the bands; they must cover 00:00–24:00 without gap nor overlap, with positive multipliers.
     *
     * @throws IllegalStateException otherwise (fails the application startup)
     */
    public static List<Band> bands(GeoPricingProperties.Dynamic config) {
        List<GeoPricingProperties.Dynamic.HourBand> raw = config.getHourBands();
        if (raw == null || raw.isEmpty()) {
            throw new IllegalStateException("zelqane.pricing.dynamic.hour-bands : au moins une tranche horaire est requise.");
        }
        List<Band> bands = new ArrayList<>();
        for (GeoPricingProperties.Dynamic.HourBand band : raw) {
            int start = parseSecond(band.getStart());
            int end = parseSecond(band.getEnd());
            if (end <= start || band.getMultiplier() == null || band.getMultiplier().signum() <= 0) {
                throw new IllegalStateException("zelqane.pricing.dynamic.hour-bands : tranche invalide " + band.getStart()
                        + "–" + band.getEnd() + ".");
            }
            String label = band.getLabel() == null || band.getLabel().isBlank()
                    ? band.getStart() + "–" + band.getEnd() : band.getLabel().trim();
            bands.add(new Band(start, end, band.getMultiplier(), label));
        }
        bands.sort(Comparator.comparingInt(Band::startSecond));
        int cursor = 0;
        for (Band band : bands) {
            if (band.startSecond() != cursor) {
                throw new IllegalStateException(
                        "zelqane.pricing.dynamic.hour-bands : les tranches doivent couvrir 00:00–24:00 sans trou ni chevauchement.");
            }
            cursor = band.endSecond();
        }
        if (cursor != SECONDS_PER_DAY) {
            throw new IllegalStateException(
                    "zelqane.pricing.dynamic.hour-bands : les tranches doivent couvrir 00:00–24:00 sans trou ni chevauchement.");
        }
        return bands;
    }

    static int parseSecond(String hhmm) {
        if (hhmm == null || !hhmm.trim().matches("\\d{1,2}:\\d{2}")) {
            throw new IllegalStateException("zelqane.pricing.dynamic.hour-bands : heure invalide « " + hhmm + " » (HH:mm).");
        }
        String[] parts = hhmm.trim().split(":");
        int hours = Integer.parseInt(parts[0]);
        int minutes = Integer.parseInt(parts[1]);
        if (minutes > 59 || hours > 24 || (hours == 24 && minutes != 0)) {
            throw new IllegalStateException("zelqane.pricing.dynamic.hour-bands : heure invalide « " + hhmm + " ».");
        }
        return hours * 3600 + minutes * 60;
    }

    // --- factors -------------------------------------------------------------------------------------------------

    public static HourFactor hourFactor(List<Band> bands, LocalTime startTime, LocalTime endTime) {
        int start = startTime.toSecondOfDay();
        int end = endTime.toSecondOfDay();
        List<PriceBreakdown.HourBandDetail> details = new ArrayList<>();
        if (end <= start) {
            return new HourFactor(BigDecimal.ONE.setScale(FACTOR_SCALE), details);
        }
        BigDecimal weighted = BigDecimal.ZERO;
        for (Band band : bands) {
            int overlap = Math.min(end, band.endSecond()) - Math.max(start, band.startSecond());
            if (overlap > 0) {
                weighted = weighted.add(band.multiplier().multiply(BigDecimal.valueOf(overlap)));
                details.add(PriceBreakdown.HourBandDetail.builder()
                        .label(band.label())
                        .minutes(Math.round(overlap / 60.0))
                        .multiplier(band.multiplier())
                        .build());
            }
        }
        return new HourFactor(weighted.divide(BigDecimal.valueOf(end - start), FACTOR_SCALE, RoundingMode.HALF_UP),
                details);
    }

    public static DayFactor dayFactor(Map<DayOfWeek, BigDecimal> multipliers, LocalDate startDate, LocalDate endDate) {
        Map<DayOfWeek, Integer> counts = new EnumMap<>(DayOfWeek.class);
        long days = ChronoUnit.DAYS.between(startDate, endDate) + 1;
        if (days <= 0) {
            return new DayFactor(BigDecimal.ONE.setScale(FACTOR_SCALE), List.of());
        }
        // Each full week contributes one of every day; only the remainder needs walking.
        long weeks = days / 7;
        for (DayOfWeek day : DayOfWeek.values()) {
            if (weeks > 0) {
                counts.put(day, (int) weeks);
            }
        }
        LocalDate cursor = startDate.plusWeeks(weeks);
        while (!cursor.isAfter(endDate)) {
            counts.merge(cursor.getDayOfWeek(), 1, Integer::sum);
            cursor = cursor.plusDays(1);
        }
        BigDecimal sum = BigDecimal.ZERO;
        List<PriceBreakdown.DayDetail> details = new ArrayList<>();
        for (Map.Entry<DayOfWeek, Integer> entry : counts.entrySet()) {
            BigDecimal multiplier = dayMultiplier(multipliers, entry.getKey());
            sum = sum.add(multiplier.multiply(BigDecimal.valueOf(entry.getValue())));
            details.add(PriceBreakdown.DayDetail.builder()
                    .dayOfWeek(dayCode(entry.getKey()))
                    .count(entry.getValue())
                    .multiplier(multiplier)
                    .build());
        }
        return new DayFactor(sum.divide(BigDecimal.valueOf(days), FACTOR_SCALE, RoundingMode.HALF_UP), details);
    }

    static BigDecimal dayMultiplier(Map<DayOfWeek, BigDecimal> multipliers, DayOfWeek day) {
        BigDecimal value = multipliers == null ? null : multipliers.get(day);
        return value == null ? BigDecimal.ONE : value;
    }

    /** {@code overlapDays × overlapping minutes of the time ranges} (0 when they do not overlap). */
    public static long overlapMinutes(TimeWindow a, TimeWindow b) {
        LocalDate start = a.startDate().isAfter(b.startDate()) ? a.startDate() : b.startDate();
        LocalDate end = a.endDate().isBefore(b.endDate()) ? a.endDate() : b.endDate();
        if (end.isBefore(start)) {
            return 0;
        }
        long days = ChronoUnit.DAYS.between(start, end) + 1;
        int from = Math.max(a.startTime().toSecondOfDay(), b.startTime().toSecondOfDay());
        int to = Math.min(a.endTime().toSecondOfDay(), b.endTime().toSecondOfDay());
        if (to <= from) {
            return 0;
        }
        return days * ((to - from) / 60);
    }

    /** {@code days × minutes(st, et)}. */
    public static long windowMinutes(TimeWindow window) {
        return Math.max(0, window.days()) * Math.max(0, window.minutesPerDay());
    }

    /**
     * Occupancy of one support: live reservations of other campaigns overlapping the window, over
     * {@code capacity × minutes(W)}.
     */
    public static Occupancy occupancy(DiffusionSupport support, List<Reservation> reservations, TimeWindow window,
                                      Long excludeCampaignId) {
        long reserved = 0;
        for (Reservation reservation : reservations) {
            if (!AvailabilityRules.LIVE.contains(reservation.getReservationStatus())) {
                continue;
            }
            if (excludeCampaignId != null && reservation.getCampaign() != null
                    && Objects.equals(reservation.getCampaign().getId(), excludeCampaignId)) {
                continue;
            }
            reserved += overlapMinutes(TimeWindow.of(reservation), window);
        }
        int capacity = Math.max(1, support.getDiffusionCapacity() == null ? 1 : support.getDiffusionCapacity());
        return new Occupancy(reserved, capacity * windowMinutes(window));
    }

    // --- price ---------------------------------------------------------------------------------------------------

    /** Figures of the demand and scarcity factors. */
    public record Demand(double supportOccupancy, double zoneOccupancy, double zoneAvailability) {
    }

    /** Breakdown with every factor at 1 (pricing disabled). */
    public static PriceBreakdown disabled(BigDecimal baseCost) {
        BigDecimal one = BigDecimal.ONE.setScale(FACTOR_SCALE);
        BigDecimal base = baseCost.setScale(2, RoundingMode.HALF_UP);
        return PriceBreakdown.builder()
                .baseCost(base)
                .multiplier(one)
                .finalCost(base)
                .clamped(false)
                .enabled(false)
                .factors(PriceBreakdown.Factors.builder().hour(one).dayOfWeek(one).demand(one).scarcity(one).build())
                .details(PriceBreakdown.Details.builder()
                        .supportOccupancy(BigDecimal.ZERO.setScale(FACTOR_SCALE))
                        .zoneOccupancy(BigDecimal.ZERO.setScale(FACTOR_SCALE))
                        .zoneAvailability(one)
                        .build())
                .explanations(new ArrayList<>(List.of("Tarification dynamique désactivée : tarif de base appliqué.")))
                .build();
    }

    public static PriceBreakdown price(GeoPricingProperties.Dynamic config, List<Band> bands, BigDecimal baseCost,
                                       TimeWindow window, Demand demand) {
        if (!config.isEnabled()) {
            return disabled(baseCost);
        }
        HourFactor hour = hourFactor(bands, window.startTime(), window.endTime());
        DayFactor day = dayFactor(config.getDayMultipliers(), window.startDate(), window.endDate());
        BigDecimal occS = scale(demand.supportOccupancy());
        BigDecimal occZ = scale(demand.zoneOccupancy());
        BigDecimal availability = scale(demand.zoneAvailability());
        BigDecimal share = config.getDemandSupportShare();
        BigDecimal demandFactor = BigDecimal.ONE.add(config.getDemandWeight()
                        .multiply(share.multiply(occS).add(BigDecimal.ONE.subtract(share).multiply(occZ))))
                .setScale(FACTOR_SCALE, RoundingMode.HALF_UP);
        BigDecimal scarcityFactor = BigDecimal.ONE.add(config.getScarcityWeight()
                        .multiply(BigDecimal.ONE.subtract(availability)))
                .setScale(FACTOR_SCALE, RoundingMode.HALF_UP);

        BigDecimal raw = hour.factor().multiply(day.factor()).multiply(demandFactor).multiply(scarcityFactor);
        BigDecimal clampedValue = raw.max(config.getMinMultiplier()).min(config.getMaxMultiplier());
        boolean clamped = raw.compareTo(clampedValue) != 0;
        BigDecimal multiplier = clampedValue.setScale(FACTOR_SCALE, RoundingMode.HALF_UP);
        BigDecimal base = baseCost.setScale(2, RoundingMode.HALF_UP);
        BigDecimal finalCost = baseCost.multiply(multiplier).setScale(2, RoundingMode.HALF_UP);

        List<String> explanations = new ArrayList<>();
        explanations.add(hourExplanation(hour));
        explanations.add(dayExplanation(day));
        explanations.add("Demande : Porteur occupé à " + percent(occS) + ", zone occupée à " + percent(occZ)
                + " : " + times(demandFactor));
        explanations.add("Disponibilité : " + percent(availability) + " des Porteurs de la zone libres : "
                + times(scarcityFactor));
        if (clamped) {
            explanations.add(raw.compareTo(config.getMaxMultiplier()) > 0
                    ? "Multiplicateur plafonné à " + times(multiplier)
                    : "Multiplicateur relevé au plancher de " + times(multiplier));
        }

        return PriceBreakdown.builder()
                .baseCost(base)
                .multiplier(multiplier)
                .finalCost(finalCost)
                .clamped(clamped)
                .enabled(true)
                .factors(PriceBreakdown.Factors.builder()
                        .hour(hour.factor()).dayOfWeek(day.factor()).demand(demandFactor).scarcity(scarcityFactor)
                        .build())
                .details(PriceBreakdown.Details.builder()
                        .supportOccupancy(occS)
                        .zoneOccupancy(occZ)
                        .zoneAvailability(availability)
                        .hourBands(hour.bands())
                        .days(day.days())
                        .build())
                .explanations(explanations)
                .build();
    }

    static String hourExplanation(HourFactor hour) {
        if (hour.bands().size() == 1) {
            String label = hour.bands().get(0).getLabel();
            return "Créneau en " + label.substring(0, 1).toLowerCase(Locale.FRENCH) + label.substring(1) + " : "
                    + times(hour.factor());
        }
        List<String> labels = hour.bands().stream().map(PriceBreakdown.HourBandDetail::getLabel).toList();
        return "Créneau sur plusieurs tranches (" + String.join(", ", labels) + ") : " + times(hour.factor());
    }

    static String dayExplanation(DayFactor day) {
        if (day.days().size() == 1) {
            return "Diffusion le " + day.days().get(0).getDayOfWeek().toLowerCase(Locale.FRENCH) + " : "
                    + times(day.factor());
        }
        int total = day.days().stream().mapToInt(PriceBreakdown.DayDetail::getCount).sum();
        return "Jours de diffusion (moyenne sur " + total + " jours) : " + times(day.factor());
    }

    /** {@code ×1,25}: two decimals, French comma. */
    public static String times(BigDecimal value) {
        DecimalFormat format = new DecimalFormat("0.00", DecimalFormatSymbols.getInstance(Locale.FRENCH));
        format.setRoundingMode(RoundingMode.HALF_UP);
        return "×" + format.format(value);
    }

    /** {@code 0.6412 → "64 %"}. */
    static String percent(BigDecimal ratio) {
        return ratio.multiply(BigDecimal.valueOf(100)).setScale(0, RoundingMode.HALF_UP).toPlainString() + " %";
    }

    static BigDecimal scale(double value) {
        return BigDecimal.valueOf(Math.max(0, Math.min(1, value))).setScale(FACTOR_SCALE, RoundingMode.HALF_UP);
    }
}
