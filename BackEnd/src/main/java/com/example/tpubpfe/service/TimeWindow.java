package com.example.tpubpfe.service;

import com.example.tpubpfe.model.Reservation;
import com.example.tpubpfe.model.SupportAvailability;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;

/**
 * A booking window: dates [startDate, endDate] × daily times [startTime, endTime). Two windows overlap when their
 * dates intersect and {@code st < other.et ∧ other.st < et} (contract §2.7).
 */
public record TimeWindow(LocalDate startDate, LocalDate endDate, LocalTime startTime, LocalTime endTime) {

    public static TimeWindow of(Reservation reservation) {
        return new TimeWindow(reservation.getStartDate(), reservation.getEndDate(),
                reservation.getStartTime(), reservation.getEndTime());
    }

    public long days() {
        return ChronoUnit.DAYS.between(startDate, endDate) + 1;
    }

    public long minutesPerDay() {
        return Duration.between(startTime, endTime).toMinutes();
    }

    public double hoursPerDay() {
        return minutesPerDay() / 60.0;
    }

    public boolean overlaps(TimeWindow other) {
        return !startDate.isAfter(other.endDate) && !other.startDate.isAfter(endDate)
                && startTime.isBefore(other.endTime) && other.startTime.isBefore(endTime);
    }

    public boolean overlaps(Reservation reservation) {
        return overlaps(of(reservation));
    }

    /** A block covers one day with its own times. */
    public boolean overlaps(SupportAvailability block) {
        LocalDate day = block.getAvailabilityDate();
        return !day.isBefore(startDate) && !day.isAfter(endDate)
                && startTime.isBefore(block.getEndTime()) && block.getStartTime().isBefore(endTime);
    }

    public TimeWindow shiftDays(long days) {
        return new TimeWindow(startDate.plusDays(days), endDate.plusDays(days), startTime, endTime);
    }

    public TimeWindow withTimes(LocalTime start, LocalTime end) {
        return new TimeWindow(startDate, endDate, start, end);
    }
}
