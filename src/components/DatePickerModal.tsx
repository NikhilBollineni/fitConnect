import React, { useState, useMemo } from 'react';
import {
    View, Text, TouchableOpacity, Modal, Dimensions,
} from 'react-native';
import tw from 'twrnc';
import { COLORS } from '../constants/theme';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import {
    startOfMonth, endOfMonth, eachDayOfInterval, getDay,
    format, addMonths, subMonths, isSameDay, isAfter, isBefore,
    startOfDay,
} from 'date-fns';

interface DatePickerModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (date: Date) => void;
    initialDate?: Date;
    title?: string;
    maxDate?: Date;
    minDate?: Date;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CELL_SIZE = Math.floor((SCREEN_WIDTH - 80) / 7);

export default function DatePickerModal({
    visible,
    onClose,
    onSelect,
    initialDate,
    title = 'Select Date',
    maxDate,
    minDate,
}: DatePickerModalProps) {
    const [viewDate, setViewDate] = useState(initialDate || new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(initialDate || null);

    const today = startOfDay(new Date());
    const effectiveMaxDate = maxDate ? startOfDay(maxDate) : today;

    // Reset when modal opens
    React.useEffect(() => {
        if (visible) {
            setViewDate(initialDate || new Date());
            setSelectedDate(initialDate || null);
        }
    }, [visible, initialDate]);

    const calendarDays = useMemo(() => {
        const monthStart = startOfMonth(viewDate);
        const monthEnd = endOfMonth(viewDate);
        const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

        // Pad the beginning with nulls for alignment
        const startDayOfWeek = getDay(monthStart);
        const paddedDays: (Date | null)[] = [];
        for (let i = 0; i < startDayOfWeek; i++) {
            paddedDays.push(null);
        }
        days.forEach(d => paddedDays.push(d));

        return paddedDays;
    }, [viewDate]);

    const handleConfirm = () => {
        if (selectedDate) {
            onSelect(selectedDate);
            onClose();
        }
    };

    const goToPrevMonth = () => setViewDate(subMonths(viewDate, 1));

    const goToNextMonth = () => {
        const nextMonth = addMonths(viewDate, 1);
        // Don't go past the max date's month
        if (!isAfter(startOfMonth(nextMonth), effectiveMaxDate)) {
            setViewDate(nextMonth);
        }
    };

    const isDateDisabled = (date: Date) => {
        const day = startOfDay(date);
        if (isAfter(day, effectiveMaxDate)) return true;
        if (minDate && isBefore(day, startOfDay(minDate))) return true;
        return false;
    };

    const canGoNext = !isAfter(startOfMonth(addMonths(viewDate, 1)), effectiveMaxDate);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={tw`flex-1 justify-end`}>
                {/* Backdrop */}
                <TouchableOpacity
                    style={tw`flex-1`}
                    activeOpacity={1}
                    onPress={onClose}
                />

                {/* Bottom sheet */}
                <View style={tw`bg-[${COLORS.backgroundLight}] rounded-t-3xl px-6 pb-10 pt-6 border-t border-white/10`}>
                    {/* Drag handle */}
                    <View style={tw`w-10 h-1 bg-white/20 rounded-full self-center mb-5`} />

                    {/* Header */}
                    <View style={tw`flex-row items-center justify-between mb-5`}>
                        <Text style={tw`text-white text-xl font-bold`}>{title}</Text>
                        <TouchableOpacity
                            onPress={onClose}
                            style={tw`w-8 h-8 rounded-full bg-white/5 items-center justify-center`}
                        >
                            <X size={16} color="#94a3b8" />
                        </TouchableOpacity>
                    </View>

                    {/* Month Navigation */}
                    <View style={tw`flex-row items-center justify-between mb-4`}>
                        <TouchableOpacity
                            onPress={goToPrevMonth}
                            style={tw`w-10 h-10 rounded-full bg-white/5 items-center justify-center`}
                        >
                            <ChevronLeft size={20} color="white" />
                        </TouchableOpacity>
                        <Text style={tw`text-white font-bold text-lg`}>
                            {format(viewDate, 'MMMM yyyy')}
                        </Text>
                        <TouchableOpacity
                            onPress={goToNextMonth}
                            disabled={!canGoNext}
                            style={tw`w-10 h-10 rounded-full bg-white/5 items-center justify-center ${!canGoNext ? 'opacity-30' : ''}`}
                        >
                            <ChevronRight size={20} color="white" />
                        </TouchableOpacity>
                    </View>

                    {/* Weekday Headers */}
                    <View style={tw`flex-row justify-around mb-2`}>
                        {WEEKDAYS.map(wd => (
                            <View key={wd} style={{ width: CELL_SIZE, alignItems: 'center' }}>
                                <Text style={tw`text-slate-500 text-xs font-bold`}>{wd}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Calendar Grid */}
                    <View style={tw`flex-row flex-wrap`}>
                        {calendarDays.map((day, idx) => {
                            if (!day) {
                                return <View key={`empty-${idx}`} style={{ width: CELL_SIZE, height: CELL_SIZE }} />;
                            }

                            const isSelected = selectedDate && isSameDay(day, selectedDate);
                            const isToday = isSameDay(day, today);
                            const disabled = isDateDisabled(day);

                            return (
                                <TouchableOpacity
                                    key={day.toISOString()}
                                    disabled={disabled}
                                    onPress={() => setSelectedDate(day)}
                                    style={[
                                        {
                                            width: CELL_SIZE,
                                            height: CELL_SIZE,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        },
                                    ]}
                                >
                                    <View
                                        style={[
                                            tw`w-10 h-10 rounded-full items-center justify-center`,
                                            isSelected && tw`bg-[${COLORS.primary}]`,
                                            isToday && !isSelected && tw`border border-[${COLORS.primary}]/40`,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                tw`text-sm font-bold`,
                                                isSelected
                                                    ? tw`text-black`
                                                    : disabled
                                                        ? tw`text-slate-700`
                                                        : isToday
                                                            ? tw`text-[${COLORS.primary}]`
                                                            : tw`text-white`,
                                            ]}
                                        >
                                            {format(day, 'd')}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Selected Date Display */}
                    {selectedDate && (
                        <View style={tw`mt-4 mb-2 items-center`}>
                            <Text style={tw`text-[${COLORS.primary}] font-bold text-base`}>
                                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                            </Text>
                        </View>
                    )}

                    {/* Action Buttons */}
                    <View style={tw`flex-row gap-3 mt-4`}>
                        <TouchableOpacity
                            onPress={onClose}
                            style={tw`flex-1 bg-white/5 border border-white/10 h-14 rounded-2xl items-center justify-center`}
                        >
                            <Text style={tw`text-slate-400 font-bold text-base`}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleConfirm}
                            disabled={!selectedDate}
                            style={tw`flex-1 bg-[${COLORS.primary}] h-14 rounded-2xl items-center justify-center ${!selectedDate ? 'opacity-40' : ''}`}
                        >
                            <Text style={tw`text-black font-bold text-base`}>Confirm</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
