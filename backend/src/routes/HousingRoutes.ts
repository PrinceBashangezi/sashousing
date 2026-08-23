import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import {
    isAdmin,
    isAuthenticated,
    isHousingReviewOwner,
} from '../middleware/authMiddleware';
import {
    HousingBuildings,
    HousingReviews,
    HousingRooms,
    RoomDrawSettings,
    RoomDrawParticipants,
    RoomDrawStatuses,
    RoomPreferences,
} from '../models/Housing';

const router = express.Router();

const roomDrawStatusSubscribers = new Map<number, Set<Response>>();
const roomPreferenceSubscribers = new Map<number, Set<Response>>();
const userPreferenceSubscribers = new Map<string, Set<Response>>();
const roomDrawSettingsSubscribers = new Set<Response>();

type RoomDrawStatusEvent = {
    buildingId: number;
    roomId: number;
    status: 'taken' | 'not_taken';
    updatedAt?: Date;
};

const sendSseEvent = (
    response: Response,
    eventName: string,
    data: unknown
) => {
    response.write(`event: ${eventName}\n`);
    response.write(`data: ${JSON.stringify(data)}\n\n`);
};

const broadcastRoomDrawStatusEvent = (event: RoomDrawStatusEvent) => {
    const subscribers = roomDrawStatusSubscribers.get(event.buildingId);
    if (!subscribers) {
        return;
    }

    subscribers.forEach((subscriber) => {
        sendSseEvent(subscriber, 'room-draw-status', event);
    });
};

const broadcastRoomPreferenceEvent = (buildingIds: Iterable<number>) => {
    new Set(buildingIds).forEach((buildingId) => {
        const subscribers = roomPreferenceSubscribers.get(buildingId);
        if (!subscribers) {
            return;
        }

        subscribers.forEach((subscriber) => {
            sendSseEvent(subscriber, 'room-preferences-changed', {
                buildingId,
            });
        });
    });
};

const broadcastUserPreferenceEvent = (userIds: Iterable<string>) => {
    new Set(userIds).forEach((userId) => {
        const subscribers = userPreferenceSubscribers.get(userId);
        if (!subscribers) {
            return;
        }

        subscribers.forEach((subscriber) => {
            sendSseEvent(subscriber, 'user-preferences-changed', {});
        });
    });
};

const broadcastRoomDrawSettingsEvent = async () => {
    const settings = await getRoomDrawSettingsPayload();
    roomDrawSettingsSubscribers.forEach((subscriber) => {
        sendSseEvent(subscriber, 'room-draw-settings', settings);
    });
};

const getBuildingIdsForRoomIds = async (roomIds: number[]) => {
    if (roomIds.length === 0) {
        return [];
    }

    const rooms = await HousingRooms.find({ id: { $in: roomIds } })
        .select('housing_building_id')
        .lean();

    return rooms.map((room) => room.housing_building_id);
};

const getParam = (param: string | string[]): string =>
    Array.isArray(param) ? param[0] : param;

const ROOM_DRAW_SETTINGS_KEY = 'global';

const isRoomDrawVisible = (settings?: {
    startsAt?: Date | null;
    endsAt?: Date | null;
} | null) => {
    if (!settings?.startsAt || !settings?.endsAt) {
        return false;
    }

    const now = new Date();
    return settings.startsAt <= now && now <= settings.endsAt;
};

const getRoomDrawSettingsPayload = async () => {
    const settings = await RoomDrawSettings.findOne({
        key: ROOM_DRAW_SETTINGS_KEY,
    }).lean();

    return {
        startsAt: settings?.startsAt || null,
        endsAt: settings?.endsAt || null,
        isVisible: isRoomDrawVisible(settings),
    };
};

const getSessionUserName = (user: Express.Request['session']['user']) =>
    user ? `${user.firstName} ${user.lastName}`.trim() : '';

const getSessionUserId = (req: Request) => req.session.user?.id.trim();

const getSessionUserEmail = (req: Request) =>
    req.session.user?.email.toLowerCase().trim();

const parseRequiredNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const parseOptionalNumber = (value: unknown) => {
    if (value === undefined) {
        return undefined;
    }

    if (value === null || value === '') {
        return null;
    }

    return parseRequiredNumber(value);
};

const parseOptionalBoolean = (value: unknown) => {
    if (value === undefined) {
        return undefined;
    }

    if (value === null || value === '') {
        return null;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    const normalizedValue = String(value).trim().toLowerCase();
    if (['true', 'yes', '1'].includes(normalizedValue)) {
        return true;
    }
    if (['false', 'no', '0'].includes(normalizedValue)) {
        return false;
    }

    return null;
};

const parseOptionalShortText = (value: unknown, maxLength: number) => {
    if (value === undefined) {
        return undefined;
    }

    if (value === null || value === '') {
        return null;
    }

    return String(value).trim().slice(0, maxLength);
};

const parseReviewRating = (value: unknown) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
        return null;
    }

    return parsed;
};

const parseReviewPayload = (body: Record<string, unknown>) => {
    const overall = parseReviewRating(body.overall);
    if (overall === null) {
        return { message: 'Overall rating is required' };
    }

    const quiet = parseReviewRating(body.quiet);
    if (quiet === null) {
        return { message: 'Quiet rating is required' };
    }

    const layout = parseReviewRating(body.layout);
    if (layout === null) {
        return { message: 'Layout rating is required' };
    }

    const temperature = parseReviewRating(body.temperature);
    if (temperature === null) {
        return { message: 'Temperature rating is required' };
    }

    const comments = String(body.comments || '').trim();
    if (!comments) {
        return { message: 'Please leave a comment' };
    }

    return {
        value: {
            overall,
            quiet,
            layout,
            temperature,
            comments,
        },
    };
};

type RoomPreferenceInput = {
    housing_room_id?: unknown;
    notes?: unknown;
};

type NormalizedRoomPreferenceInput = {
    housing_room_id: number;
    rank: number;
    notes?: string;
};

const MAX_ACTIVE_ROOM_PREFERENCES = 2;

const getRoomDrawParticipant = async (req: Request) => {
    const userId = getSessionUserId(req);
    if (!userId) {
        return null;
    }

    return RoomDrawParticipants.findOne({ user_id: userId }).lean();
};

const requiresRoomDrawPriority = async (req: Request) => {
    if (!req.session.user) {
        return false;
    }

    const participant = await getRoomDrawParticipant(req);
    return !participant?.classYear || !participant?.drawDate;
};

const isBetterRoomDrawPriority = (
    challenger: { classYear: number; drawDate: Date },
    incumbent: { classYear: number; drawDate: Date },
    roomYear?: number | null
) => {
    if (roomYear) {
        const challengerMatchesRoomYear = challenger.classYear === roomYear;
        const incumbentMatchesRoomYear = incumbent.classYear === roomYear;

        if (challengerMatchesRoomYear !== incumbentMatchesRoomYear) {
            return challengerMatchesRoomYear;
        }
    }

    return challenger.drawDate.getTime() < incumbent.drawDate.getTime();
};

const getInitials = (name?: string, email?: string) => {
    const nameInitials = String(name || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('');

    if (nameInitials) {
        return nameInitials;
    }

    return String(email || '')
        .trim()
        .slice(0, 2)
        .toUpperCase();
};

const toRoomPreferencePayload = (
    preference: Record<string, any>,
    room?: Record<string, any> | null,
    building?: Record<string, any> | null,
    ownerPriority?: Record<string, any> | null
) => ({
    ...preference,
    room,
    building,
    rankOwner: {
        initials: getInitials(preference.user_name, preference.user_email),
        name: preference.user_name,
        rank: preference.rank,
        classYear: ownerPriority?.classYear,
        drawDate: ownerPriority?.drawDate,
    },
    bumpedBy:
        preference.status === 'bumped'
            ? {
                  initials: getInitials(
                      preference.bumpedByName,
                      preference.bumpedByEmail
                  ),
                  name: preference.bumpedByName,
                  classYear: preference.bumpedByClassYear,
                  drawDate: preference.bumpedByDrawDate,
                  bumpedAt: preference.bumpedAt,
              }
            : null,
});

/**
 * @route   GET /api/campus/housing
 * @desc    Get all housing buildings
 * @access  Public
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const buildings = await HousingBuildings.find({});
        res.json(buildings);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @route   GET /api/campus/housing/search-index
 * @desc    Get buildings with room numbers for search
 * @access  Public
 */
router.get('/search-index', async (_req: Request, res: Response) => {
    try {
        const [buildings, rooms] = await Promise.all([
            HousingBuildings.find({}).lean(),
            HousingRooms.find({}, { housing_building_id: 1, room_number: 1 })
                .sort({ room_number: 1 })
                .lean(),
        ]);

        const roomNumbersByBuilding = rooms.reduce<Record<number, string[]>>(
            (acc, room) => {
                if (!acc[room.housing_building_id]) {
                    acc[room.housing_building_id] = [];
                }

                acc[room.housing_building_id].push(room.room_number);
                return acc;
            },
            {}
        );

        res.json(
            buildings.map((building) => ({
                ...building,
                roomNumbers: roomNumbersByBuilding[building.id] || [],
            }))
        );
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @route   PATCH /api/campus/housing/admin/buildings/:buildingId
 * @desc    Update housing building data
 * @access  Admin
 */
router.patch(
    '/admin/buildings/:buildingId',
    isAdmin,
    async (req: Request, res: Response) => {
        try {
            const buildingId = parseInt(getParam(req.params.buildingId), 10);
            if (isNaN(buildingId)) {
                res.status(400).json({ message: 'Invalid building ID format' });
                return;
            }

            const updateData: Record<string, unknown> = {};
            const { name, campus, floors, eligibleYear, description } = req.body;

            if (name !== undefined) {
                const trimmedName = String(name).trim();
                if (!trimmedName) {
                    res.status(400).json({ message: 'Building name is required' });
                    return;
                }

                updateData.name = trimmedName;
            }

            if (campus !== undefined) {
                const trimmedCampus = String(campus).trim();
                if (!trimmedCampus) {
                    res.status(400).json({ message: 'Campus is required' });
                    return;
                }

                updateData.campus = trimmedCampus;
            }

            if (floors !== undefined) {
                const parsedFloors = parseRequiredNumber(floors);
                if (
                    parsedFloors === null ||
                    !Number.isInteger(parsedFloors) ||
                    parsedFloors < 1
                ) {
                    res.status(400).json({
                        message: 'Floors must be a positive whole number',
                    });
                    return;
                }

                updateData.floors = parsedFloors;
            }

            if (eligibleYear !== undefined) {
                const parsedEligibleYear = parseOptionalNumber(eligibleYear) as
                    | number
                    | null;
                if (parsedEligibleYear === null) {
                    updateData.eligibleYear = null;
                } else if (
                    !Number.isInteger(parsedEligibleYear) ||
                    parsedEligibleYear < 1 ||
                    parsedEligibleYear > 4
                ) {
                    res.status(400).json({
                        message: 'Eligible year must be 1, 2, 3, or 4',
                    });
                    return;
                } else {
                    updateData.eligibleYear = parsedEligibleYear;
                }
            }

            if (description !== undefined) {
                updateData.description = String(description).trim();
            }

            const updatedBuilding = await HousingBuildings.findOneAndUpdate(
                { id: buildingId },
                updateData,
                {
                    new: true,
                    runValidators: true,
                }
            );

            if (!updatedBuilding) {
                res.status(404).json({ message: 'Building not found' });
                return;
            }

            res.json(updatedBuilding);
        } catch (error) {
            if (
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                error.code === 11000
            ) {
                res.status(400).json({
                    message: 'A building with that name already exists',
                });
                return;
            }

            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   DELETE /api/campus/housing/admin/buildings/:buildingId
 * @desc    Delete a housing building and related room data
 * @access  Admin
 */
router.delete(
    '/admin/buildings/:buildingId',
    isAdmin,
    async (req: Request, res: Response) => {
        try {
            const buildingId = parseInt(getParam(req.params.buildingId), 10);
            if (isNaN(buildingId)) {
                res.status(400).json({ message: 'Invalid building ID format' });
                return;
            }

            const building = await HousingBuildings.findOne({ id: buildingId });
            if (!building) {
                res.status(404).json({ message: 'Building not found' });
                return;
            }

            const rooms = await HousingRooms.find({
                housing_building_id: buildingId,
            }).select('id');
            const roomIds = rooms.map((room) => room.id);
            await Promise.all([
                HousingBuildings.deleteOne({ id: buildingId }),
                HousingRooms.deleteMany({ housing_building_id: buildingId }),
                HousingReviews.deleteMany({
                    housing_room_id: { $in: roomIds },
                }),
                RoomDrawStatuses.deleteMany({
                    housing_room_id: { $in: roomIds },
                }),
                RoomPreferences.deleteMany({
                    housing_room_id: { $in: roomIds },
                }),
            ]);

            res.json({
                message: 'Building deleted',
                deletedBuildingId: buildingId,
                deletedRoomCount: roomIds.length,
            });
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   PATCH /api/campus/housing/admin/rooms/:roomId
 * @desc    Update housing room data
 * @access  Admin
 */
router.patch(
    '/admin/rooms/:roomId',
    isAdmin,
    async (req: Request, res: Response) => {
        try {
            const roomId = parseInt(getParam(req.params.roomId), 10);
            if (isNaN(roomId)) {
                res.status(400).json({ message: 'Invalid room ID format' });
                return;
            }

            const update = {
                $set: {} as Record<string, unknown>,
                $unset: {} as Record<string, ''>,
            };
            const {
                room_number,
                housing_building_id,
                size,
                occupancy_type,
                closet_type,
                bathroom_type,
                floor,
                eligibleYear,
                sink,
                closet,
                closetType,
                balcony,
                privateBath,
                suiteBath,
                note,
            } = req.body;

            if (room_number !== undefined) {
                const trimmedRoomNumber = String(room_number).trim();
                if (!trimmedRoomNumber) {
                    res.status(400).json({ message: 'Room number is required' });
                    return;
                }

                update.$set.room_number = trimmedRoomNumber;
            }

            if (housing_building_id !== undefined) {
                const parsedBuildingId = parseRequiredNumber(housing_building_id);
                if (parsedBuildingId === null) {
                    res.status(400).json({
                        message: 'Building ID must be a number',
                    });
                    return;
                }

                const building = await HousingBuildings.findOne({
                    id: parsedBuildingId,
                });
                if (!building) {
                    res.status(404).json({ message: 'Building not found' });
                    return;
                }

                update.$set.housing_building_id = parsedBuildingId;
            }

            const optionalNumberFields = {
                size,
                occupancy_type,
                closet_type,
                bathroom_type,
                floor,
                eligibleYear,
            };

            for (const [field, value] of Object.entries(optionalNumberFields)) {
                const parsedValue = parseOptionalNumber(value);
                if (parsedValue === undefined) {
                    continue;
                }

                if (parsedValue === null) {
                    update.$unset[field] = '';
                    continue;
                }

                if (
                    (field === 'eligibleYear' &&
                        (!Number.isInteger(parsedValue) ||
                            parsedValue < 1 ||
                            parsedValue > 4)) ||
                    (field === 'floor' &&
                        (!Number.isInteger(parsedValue) || parsedValue < 1))
                ) {
                    res.status(400).json({
                        message:
                            field === 'eligibleYear'
                                ? 'Eligible year must be 1, 2, 3, or 4'
                                : 'Floor must be a positive whole number',
                    });
                    return;
                }

                update.$set[field] = parsedValue;
            }

            const optionalBooleanFields = {
                sink,
                closet,
                balcony,
                privateBath,
                suiteBath,
            };

            for (const [field, value] of Object.entries(optionalBooleanFields)) {
                const parsedValue = parseOptionalBoolean(value);
                if (parsedValue === undefined) {
                    continue;
                }

                if (parsedValue === null) {
                    update.$unset[field] = '';
                    continue;
                }

                update.$set[field] = parsedValue;
            }

            const optionalTextFields = {
                closetType: 80,
                note: 300,
            };

            for (const [field, maxLength] of Object.entries(optionalTextFields)) {
                const parsedValue = parseOptionalShortText(
                    req.body[field],
                    maxLength
                );
                if (parsedValue === undefined) {
                    continue;
                }

                if (parsedValue === null) {
                    update.$unset[field] = '';
                    continue;
                }

                update.$set[field] = parsedValue;
            }

            const updatePayload: Record<string, unknown> = {};
            if (Object.keys(update.$set).length > 0) {
                updatePayload.$set = update.$set;
            }
            if (Object.keys(update.$unset).length > 0) {
                updatePayload.$unset = update.$unset;
            }

            const updatedRoom = await HousingRooms.findOneAndUpdate(
                { id: roomId },
                updatePayload,
                {
                    new: true,
                    runValidators: true,
                }
            );

            if (!updatedRoom) {
                res.status(404).json({ message: 'Room not found' });
                return;
            }

            res.json(updatedRoom);
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   DELETE /api/campus/housing/admin/rooms/:roomId
 * @desc    Delete a housing room and related room data
 * @access  Admin
 */
router.delete(
    '/admin/rooms/:roomId',
    isAdmin,
    async (req: Request, res: Response) => {
        try {
            const roomId = parseInt(getParam(req.params.roomId), 10);
            if (isNaN(roomId)) {
                res.status(400).json({ message: 'Invalid room ID format' });
                return;
            }

            const room = await HousingRooms.findOne({ id: roomId });
            if (!room) {
                res.status(404).json({ message: 'Room not found' });
                return;
            }

            await Promise.all([
                HousingRooms.deleteOne({ id: roomId }),
                HousingReviews.deleteMany({ housing_room_id: roomId }),
                RoomDrawStatuses.deleteMany({ housing_room_id: roomId }),
                RoomPreferences.deleteMany({ housing_room_id: roomId }),
            ]);

            res.json({
                message: 'Room deleted',
                deletedRoomId: roomId,
                deletedRoomNumber: room.room_number,
                buildingId: room.housing_building_id,
            });
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   GET /api/campus/housing/room-draw/settings
 * @desc    Get room draw visibility settings
 * @access  Public
 */
router.get('/room-draw/settings', async (_req: Request, res: Response) => {
    try {
        res.json(await getRoomDrawSettingsPayload());
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @route   GET /api/campus/housing/room-draw/settings-events
 * @desc    Subscribe to room draw window changes
 * @access  Public
 */
router.get('/room-draw/settings-events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    roomDrawSettingsSubscribers.add(res);
    sendSseEvent(res, 'connected', {});

    const keepAlive = setInterval(() => {
        res.write(': keep-alive\n\n');
    }, 25000);

    req.on('close', () => {
        clearInterval(keepAlive);
        roomDrawSettingsSubscribers.delete(res);
    });
});

/**
 * @route   GET /api/campus/housing/room-draw/priority
 * @desc    Get the signed-in user's room draw priority
 * @access  isAuthenticated
 */
router.get(
    '/room-draw/priority',
    isAuthenticated,
    async (req: Request, res: Response) => {
        try {
            const settings = await getRoomDrawSettingsPayload();
            if (!settings.isVisible) {
                res.status(403).json({
                    message: 'Room draw priority is only available during room draw',
                });
                return;
            }

            const participant = await getRoomDrawParticipant(req);
            res.json({
                ...settings,
                priority: participant || null,
                requiresPriority: !participant,
            });
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   PUT /api/campus/housing/room-draw/priority
 * @desc    Save the signed-in user's room draw priority
 * @access  isAuthenticated
 */
router.put(
    '/room-draw/priority',
    isAuthenticated,
    async (req: Request, res: Response) => {
        try {
            const settings = await getRoomDrawSettingsPayload();
            if (!settings.isVisible) {
                res.status(403).json({
                    message: 'Room draw priority is only available during room draw',
                });
                return;
            }

            const userId = getSessionUserId(req);
            const userEmail = getSessionUserEmail(req);
            const sessionUser = req.session.user!;
            if (!userId || !userEmail) {
                res.status(401).json({ message: 'Authentication required' });
                return;
            }

            const classYear = Number(req.body.classYear);
            const drawDate = req.body.drawDate
                ? new Date(String(req.body.drawDate))
                : null;

            if (
                !Number.isInteger(classYear) ||
                classYear < 1 ||
                classYear > 4
            ) {
                res.status(400).json({
                    message: 'Year must be a number from 1 to 4',
                });
                return;
            }

            if (!drawDate || Number.isNaN(drawDate.getTime())) {
                res.status(400).json({
                    message: 'Draw date is required',
                });
                return;
            }

            const participant = await RoomDrawParticipants.findOneAndUpdate(
                { user_id: userId },
                {
                    user_id: userId,
                    user_email: userEmail,
                    user_name: getSessionUserName(sessionUser),
                    classYear,
                    drawDate,
                },
                {
                    new: true,
                    upsert: true,
                    runValidators: true,
                    setDefaultsOnInsert: true,
                }
            );

            const userPreferences = await RoomPreferences.find({
                user_id: userId,
                $or: [{ status: 'active' }, { status: { $exists: false } }],
            }).lean();
            broadcastRoomPreferenceEvent(
                await getBuildingIdsForRoomIds(
                    userPreferences.map(
                        (preference) => preference.housing_room_id
                    )
                )
            );
            broadcastUserPreferenceEvent([userId]);

            res.json({
                ...settings,
                priority: participant,
                requiresPriority: false,
            });
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   PATCH /api/campus/housing/room-draw/settings
 * @desc    Update room draw visibility settings
 * @access  Admin
 */
router.patch(
    '/room-draw/settings',
    isAdmin,
    async (req: Request, res: Response) => {
        try {
            const { startsAt, endsAt } = req.body;

            const parsedStartsAt = startsAt ? new Date(startsAt) : null;
            const parsedEndsAt = endsAt ? new Date(endsAt) : null;

            if (
                (startsAt && Number.isNaN(parsedStartsAt?.getTime())) ||
                (endsAt && Number.isNaN(parsedEndsAt?.getTime()))
            ) {
                res.status(400).json({ message: 'Invalid date format' });
                return;
            }

            if (
                parsedStartsAt &&
                parsedEndsAt &&
                parsedStartsAt >= parsedEndsAt
            ) {
                res.status(400).json({
                    message: 'Start time must be before end time',
                });
                return;
            }

            await RoomDrawSettings.findOneAndUpdate(
                { key: ROOM_DRAW_SETTINGS_KEY },
                {
                    key: ROOM_DRAW_SETTINGS_KEY,
                    startsAt: parsedStartsAt,
                    endsAt: parsedEndsAt,
                },
                {
                    new: true,
                    upsert: true,
                    setDefaultsOnInsert: true,
                }
            );

            const payload = await getRoomDrawSettingsPayload();
            await broadcastRoomDrawSettingsEvent();
            res.json(payload);
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   POST /api/campus/housing/room-draw/clear-statuses
 * @desc    Clear all room draw statuses
 * @access  Admin
 */
router.post(
    '/room-draw/clear-statuses',
    isAdmin,
    async (_req: Request, res: Response) => {
        try {
            const statuses = await RoomDrawStatuses.find({}).lean();
            const roomIds = statuses.map((status) => status.housing_room_id);
            const rooms = await HousingRooms.find({
                id: { $in: roomIds },
            })
                .select('id housing_building_id')
                .lean();
            const buildingIdByRoomId = new Map(
                rooms.map((room) => [room.id, room.housing_building_id])
            );
            const result = await RoomDrawStatuses.deleteMany({});

            statuses.forEach((status) => {
                const buildingId = buildingIdByRoomId.get(status.housing_room_id);
                if (buildingId) {
                    broadcastRoomDrawStatusEvent({
                        buildingId,
                        roomId: status.housing_room_id,
                        status: 'not_taken',
                        updatedAt: new Date(),
                    });
                }
            });

            res.json({
                message: 'Room draw statuses cleared',
                deletedCount: result.deletedCount,
            });
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   POST /api/campus/housing/room-draw/end
 * @desc    End room draw without clearing room draw statuses
 * @access  Admin
 */
router.post(
    '/room-draw/end',
    isAdmin,
    async (_req: Request, res: Response) => {
        try {
            const now = new Date();

            await RoomDrawSettings.findOneAndUpdate(
                { key: ROOM_DRAW_SETTINGS_KEY },
                {
                    key: ROOM_DRAW_SETTINGS_KEY,
                    startsAt: null,
                    endsAt: now,
                },
                {
                    new: true,
                    upsert: true,
                    setDefaultsOnInsert: true,
                }
            );

            await broadcastRoomDrawSettingsEvent();
            res.json({
                ...(await getRoomDrawSettingsPayload()),
                message: 'Room draw ended',
            });
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   POST /api/campus/housing/room-draw/close
 * @desc    Close room draw and clear all room draw statuses
 * @access  Admin
 */
router.post(
    '/room-draw/close',
    isAdmin,
    async (_req: Request, res: Response) => {
        try {
            const now = new Date();

            await RoomDrawSettings.findOneAndUpdate(
                { key: ROOM_DRAW_SETTINGS_KEY },
                {
                    key: ROOM_DRAW_SETTINGS_KEY,
                    startsAt: null,
                    endsAt: now,
                },
                {
                    new: true,
                    upsert: true,
                    setDefaultsOnInsert: true,
                }
            );

            const statuses = await RoomDrawStatuses.find({}).lean();
            const roomIds = statuses.map((status) => status.housing_room_id);
            const rooms = await HousingRooms.find({
                id: { $in: roomIds },
            })
                .select('id housing_building_id')
                .lean();
            const buildingIdByRoomId = new Map(
                rooms.map((room) => [room.id, room.housing_building_id])
            );
            const result = await RoomDrawStatuses.deleteMany({});

            statuses.forEach((status) => {
                const buildingId = buildingIdByRoomId.get(status.housing_room_id);
                if (buildingId) {
                    broadcastRoomDrawStatusEvent({
                        buildingId,
                        roomId: status.housing_room_id,
                        status: 'not_taken',
                        updatedAt: new Date(),
                    });
                }
            });

            await broadcastRoomDrawSettingsEvent();
            res.json({
                ...(await getRoomDrawSettingsPayload()),
                message: 'Room draw closed and statuses cleared',
                deletedCount: result.deletedCount,
            });
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   GET /api/campus/housing/:building/room-draw/statuses
 * @desc    Get active room draw statuses for a building
 * @access  Public
 */
router.get(
    '/:building/room-draw/statuses',
    async (req: Request, res: Response) => {
        try {
            const buildingId = parseInt(getParam(req.params.building), 10);

            if (isNaN(buildingId)) {
                res.status(400).json({ message: 'Invalid building ID format' });
                return;
            }

            const settings = await getRoomDrawSettingsPayload();
            if (!settings.isVisible) {
                res.json({ ...settings, statuses: {} });
                return;
            }

            const participant = await getRoomDrawParticipant(req);
            const needsPriority = Boolean(req.session.user) && !participant;
            if (!req.session.user || needsPriority) {
                res.json({
                    ...settings,
                    statuses: {},
                    priority: participant || null,
                    requiresPriority: needsPriority,
                });
                return;
            }

            const rooms = await HousingRooms.find({
                housing_building_id: buildingId,
            }).lean();
            const roomIds = rooms.map((room) => room.id);
            const statuses = await RoomDrawStatuses.find({
                housing_room_id: { $in: roomIds },
            }).lean();
            const sessionUserId = req.session.user?.id;
            const isSessionAdmin = Boolean(req.session.user?.isAdmin);

            const statusMap = statuses.reduce<
                Record<
                    number,
                    {
                        status: 'taken';
                        isOwner: boolean;
                        updatedAt?: Date;
                        markedByUserId?: string;
                        markedByName?: string;
                        markedByEmail?: string;
                    }
                >
            >((acc, status) => {
                acc[status.housing_room_id] = {
                    status: 'taken',
                    isOwner: status.markedByUserId === sessionUserId,
                    updatedAt: status.updatedAt,
                };

                if (isSessionAdmin) {
                    acc[status.housing_room_id].markedByUserId =
                        status.markedByUserId;
                    acc[status.housing_room_id].markedByName =
                        status.markedByName;
                    acc[status.housing_room_id].markedByEmail =
                        status.markedByEmail;
                }

                return acc;
            }, {});

            res.json({
                ...settings,
                statuses: statusMap,
                priority: participant || null,
                requiresPriority: false,
            });
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   GET /api/campus/housing/:building/room-draw/status-events
 * @desc    Subscribe to room draw status changes for a building
 * @access  Public
 */
router.get(
    '/:building/room-draw/status-events',
    async (req: Request, res: Response) => {
        const buildingId = parseInt(getParam(req.params.building), 10);

        if (isNaN(buildingId)) {
            res.status(400).json({ message: 'Invalid building ID format' });
            return;
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        if (!roomDrawStatusSubscribers.has(buildingId)) {
            roomDrawStatusSubscribers.set(buildingId, new Set());
        }

        const subscribers = roomDrawStatusSubscribers.get(buildingId)!;
        subscribers.add(res);
        sendSseEvent(res, 'connected', { buildingId });

        const keepAlive = setInterval(() => {
            res.write(': keep-alive\n\n');
        }, 25000);

        req.on('close', () => {
            clearInterval(keepAlive);
            subscribers.delete(res);
            if (subscribers.size === 0) {
                roomDrawStatusSubscribers.delete(buildingId);
            }
        });
    }
);

/**
 * @route   PATCH /api/campus/housing/room-draw/rooms/:roomId
 * @desc    Mark a room taken or not taken during room draw
 * @access  isAuthenticated
 */
router.patch(
    '/room-draw/rooms/:roomId',
    isAuthenticated,
    async (req: Request, res: Response) => {
        try {
            const settings = await getRoomDrawSettingsPayload();
            if (!settings.isVisible) {
                res.status(403).json({
                    message: 'Room draw reporting is not active',
                });
                return;
            }

            if (await requiresRoomDrawPriority(req)) {
                res.status(403).json({
                    message: 'Enter your draw priority before using room draw',
                });
                return;
            }

            const roomId = parseInt(getParam(req.params.roomId), 10);
            if (isNaN(roomId)) {
                res.status(400).json({ message: 'Invalid room ID format' });
                return;
            }

            const room = await HousingRooms.findOne({ id: roomId });
            if (!room) {
                res.status(404).json({ message: 'Room not found' });
                return;
            }

            const requestedStatus = String(req.body.status || '');
            if (!['taken', 'not_taken', 'available'].includes(requestedStatus)) {
                res.status(400).json({
                    message: 'Status must be taken or not_taken',
                });
                return;
            }

            const sessionUser = req.session.user!;
            const existingStatus = await RoomDrawStatuses.findOne({
                housing_room_id: roomId,
            });

            if (
                existingStatus &&
                existingStatus.markedByUserId !== sessionUser.id &&
                !sessionUser.isAdmin
            ) {
                res.status(403).json({
                    message: 'Only the user who marked this room taken can change it',
                });
                return;
            }

            if (
                requestedStatus === 'not_taken' ||
                requestedStatus === 'available'
            ) {
                await RoomDrawStatuses.deleteOne({ housing_room_id: roomId });
                broadcastRoomDrawStatusEvent({
                    buildingId: room.housing_building_id,
                    roomId,
                    status: 'not_taken',
                    updatedAt: new Date(),
                });
                res.json({
                    roomId,
                    status: 'not_taken',
                    isOwner: false,
                    ...settings,
                });
                return;
            }

            if (!sessionUser.isAdmin) {
                const existingUserClaim = await RoomDrawStatuses.findOne({
                    markedByUserId: sessionUser.id,
                    housing_room_id: { $ne: roomId },
                });

                if (existingUserClaim) {
                    res.status(403).json({
                        message: 'You can only mark one room taken at a time',
                    });
                    return;
                }
            }

            let updatedStatus;
            if (existingStatus) {
                updatedStatus = await RoomDrawStatuses.findOneAndUpdate(
                    sessionUser.isAdmin
                        ? { housing_room_id: roomId }
                        : {
                              housing_room_id: roomId,
                              markedByUserId: sessionUser.id,
                          },
                    {
                        status: 'taken',
                        markedByUserId: sessionUser.id,
                        markedByEmail: sessionUser.email,
                        markedByName: getSessionUserName(sessionUser),
                    },
                    {
                        new: true,
                    }
                );
            } else {
                try {
                    updatedStatus = await RoomDrawStatuses.create({
                        housing_room_id: roomId,
                        status: 'taken',
                        markedByUserId: sessionUser.id,
                        markedByEmail: sessionUser.email,
                        markedByName: getSessionUserName(sessionUser),
                    });
                } catch (error) {
                    if (
                        typeof error === 'object' &&
                        error !== null &&
                        'code' in error &&
                        error.code === 11000
                    ) {
                        res.status(403).json({
                            message: 'This room was already marked taken by another user',
                        });
                        return;
                    }

                    throw error;
                }
            }

            if (!updatedStatus) {
                res.status(403).json({
                    message: 'Only the user who marked this room taken can change it',
                });
                return;
            }

            broadcastRoomDrawStatusEvent({
                buildingId: room.housing_building_id,
                roomId,
                status: 'taken',
                updatedAt: updatedStatus.updatedAt,
            });

            res.json({
                roomId,
                status: updatedStatus.status,
                isOwner: true,
                updatedAt: updatedStatus.updatedAt,
                ...(sessionUser.isAdmin
                    ? {
                          markedByUserId: updatedStatus.markedByUserId,
                          markedByName: updatedStatus.markedByName,
                          markedByEmail: updatedStatus.markedByEmail,
                      }
                    : {}),
                ...settings,
            });
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   GET /api/campus/housing/room-preferences
 * @desc    Get the signed-in user's ranked room preferences
 * @access  isAuthenticated
 */
router.get(
    '/room-preferences/events',
    isAuthenticated,
    (req: Request, res: Response) => {
        const userId = getSessionUserId(req);
        if (!userId) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        if (!userPreferenceSubscribers.has(userId)) {
            userPreferenceSubscribers.set(userId, new Set());
        }

        const subscribers = userPreferenceSubscribers.get(userId)!;
        subscribers.add(res);
        sendSseEvent(res, 'connected', {});

        const keepAlive = setInterval(() => {
            res.write(': keep-alive\n\n');
        }, 25000);

        req.on('close', () => {
            clearInterval(keepAlive);
            subscribers.delete(res);
            if (subscribers.size === 0) {
                userPreferenceSubscribers.delete(userId);
            }
        });
    }
);

router.get(
    '/room-preferences',
    isAuthenticated,
    async (req: Request, res: Response) => {
        try {
            const settings = await getRoomDrawSettingsPayload();
            if (!settings.isVisible) {
                res.status(403).json({
                    message: 'Room ranking is only available during room draw',
                });
                return;
            }

            if (await requiresRoomDrawPriority(req)) {
                res.status(403).json({
                    message: 'Enter your draw priority before using room ranking',
                });
                return;
            }

            const userId = getSessionUserId(req);
            const userEmail = getSessionUserEmail(req);
            if (!userId || !userEmail) {
                res.status(401).json({ message: 'Authentication required' });
                return;
            }

            const preferences = await RoomPreferences.find({
                user_id: userId,
                $or: [
                    { status: 'active' },
                    { status: 'bumped' },
                    { status: { $exists: false } },
                ],
            })
                .sort({ status: 1, rank: 1, updatedAt: -1 })
                .lean();

            const roomIds = preferences.map(
                (preference) => preference.housing_room_id
            );
            const rooms = await HousingRooms.find({
                id: { $in: roomIds },
            }).lean();
            const buildings = await HousingBuildings.find({
                id: { $in: rooms.map((room) => room.housing_building_id) },
            }).lean();
            const participantIds = preferences.map(
                (preference) => preference.user_id
            );
            const participants = await RoomDrawParticipants.find({
                user_id: { $in: participantIds },
            }).lean();

            const roomsById = new Map(rooms.map((room) => [room.id, room]));
            const buildingsById = new Map(
                buildings.map((building) => [building.id, building])
            );
            const participantsByUserId = new Map(
                participants.map((participant) => [
                    participant.user_id,
                    participant,
                ])
            );

            res.json(
                preferences.map((preference) => {
                    const room = roomsById.get(preference.housing_room_id);
                    const building = room
                        ? buildingsById.get(room.housing_building_id)
                        : null;

                    return toRoomPreferencePayload(
                        {
                            ...preference,
                            status: preference.status || 'active',
                        },
                        room,
                        building,
                        participantsByUserId.get(preference.user_id)
                    );
                })
            );
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   PUT /api/campus/housing/room-preferences
 * @desc    Replace the signed-in user's ranked room preference list
 * @access  isAuthenticated
 */
router.put(
    '/room-preferences',
    isAuthenticated,
    async (req: Request, res: Response) => {
        try {
            const settings = await getRoomDrawSettingsPayload();
            if (!settings.isVisible) {
                res.status(403).json({
                    message: 'Room ranking is only available during room draw',
                });
                return;
            }

            if (await requiresRoomDrawPriority(req)) {
                res.status(403).json({
                    message: 'Enter your draw priority before using room ranking',
                });
                return;
            }

            const userId = getSessionUserId(req);
            const userEmail = getSessionUserEmail(req);
            const sessionUser = req.session.user!;
            if (!userId || !userEmail) {
                res.status(401).json({ message: 'Authentication required' });
                return;
            }

            const items: RoomPreferenceInput[] = Array.isArray(req.body.items)
                ? req.body.items
                : [];
            if (items.length > MAX_ACTIVE_ROOM_PREFERENCES) {
                res.status(400).json({
                    message: 'You can rank up to 2 rooms',
                });
                return;
            }

            const normalizedItems: NormalizedRoomPreferenceInput[] = items.map(
                (item, index) => ({
                    housing_room_id: Number(item.housing_room_id),
                    rank: index + 1,
                    notes:
                        item.notes === undefined
                            ? undefined
                            : String(item.notes).trim().slice(0, 500),
                })
            );

            if (
                normalizedItems.some(
                    (item) => !Number.isInteger(item.housing_room_id)
                )
            ) {
                res.status(400).json({ message: 'Invalid room ID format' });
                return;
            }

            const uniqueRoomIds = new Set(
                normalizedItems.map((item) => item.housing_room_id)
            );
            if (uniqueRoomIds.size !== normalizedItems.length) {
                res.status(400).json({
                    message: 'A room can only appear once in your ranking',
                });
                return;
            }

            const previousActivePreferences = await RoomPreferences.find({
                user_id: userId,
                $or: [{ status: 'active' }, { status: { $exists: false } }],
            }).lean();
            const activePreferences = await RoomPreferences.find({
                user_id: userId,
                housing_room_id: { $in: [...uniqueRoomIds] },
                $or: [{ status: 'active' }, { status: { $exists: false } }],
            });
            if (activePreferences.length !== uniqueRoomIds.size) {
                res.status(403).json({
                    message: 'You can only save rooms you currently hold',
                });
                return;
            }

            await RoomPreferences.deleteMany({
                user_id: userId,
                $or: [{ status: 'active' }, { status: { $exists: false } }],
                housing_room_id: { $nin: [...uniqueRoomIds] },
            });

            await Promise.all(
                activePreferences.map((preference, index) => {
                    preference.rank = 1000 + index;
                    preference.status = 'active';
                    return preference.save();
                })
            );

            await Promise.all(
                normalizedItems.map((item) =>
                    RoomPreferences.findOneAndUpdate(
                        {
                            user_id: userId,
                            housing_room_id: item.housing_room_id,
                            $or: [
                                { status: 'active' },
                                { status: { $exists: false } },
                            ],
                        },
                        {
                            user_email: userEmail,
                            user_name: getSessionUserName(sessionUser),
                            rank: item.rank,
                            notes: item.notes,
                            status: 'active',
                        },
                        { runValidators: true }
                    )
                )
            );

            const changedRoomIds = [
                ...previousActivePreferences.map(
                    (preference) => preference.housing_room_id
                ),
                ...normalizedItems.map((item) => item.housing_room_id),
            ];
            broadcastRoomPreferenceEvent(
                await getBuildingIdsForRoomIds(changedRoomIds)
            );
            broadcastUserPreferenceEvent([userId]);

            res.json({ message: 'Room preferences saved' });
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   POST /api/campus/housing/room-preferences/rooms/:roomId
 * @desc    Add a room to the signed-in user's ranked preference list
 * @access  isAuthenticated
 */
router.post(
    '/room-preferences/rooms/:roomId',
    isAuthenticated,
    async (req: Request, res: Response) => {
        try {
            const settings = await getRoomDrawSettingsPayload();
            if (!settings.isVisible) {
                res.status(403).json({
                    message: 'Room ranking is only available during room draw',
                });
                return;
            }

            if (await requiresRoomDrawPriority(req)) {
                res.status(403).json({
                    message: 'Enter your draw priority before using room ranking',
                });
                return;
            }

            const userId = getSessionUserId(req);
            const userEmail = getSessionUserEmail(req);
            const sessionUser = req.session.user!;
            if (!userId || !userEmail) {
                res.status(401).json({ message: 'Authentication required' });
                return;
            }

            const roomId = parseInt(getParam(req.params.roomId), 10);
            if (isNaN(roomId)) {
                res.status(400).json({ message: 'Invalid room ID format' });
                return;
            }

            const room = (await HousingRooms.findOne({ id: roomId }).lean()) as {
                eligibleYear?: number | null;
                housing_building_id: number;
            } | null;
            if (!room) {
                res.status(404).json({ message: 'Room not found' });
                return;
            }

            const challengerPriority = await getRoomDrawParticipant(req);
            if (!challengerPriority) {
                res.status(403).json({
                    message: 'Enter your draw priority before using room ranking',
                });
                return;
            }

            const session = await mongoose.startSession();
            let preference = null;
            let bumpedPreference = null;
            let alreadyInPreferences = false;

            try {
                await session.withTransaction(async () => {
                    const existingPreference = await RoomPreferences.findOne({
                        user_id: userId,
                        housing_room_id: roomId,
                        $or: [
                            { status: 'active' },
                            { status: { $exists: false } },
                        ],
                    }).session(session);
                    if (existingPreference) {
                        preference = existingPreference;
                        alreadyInPreferences = true;
                        return;
                    }

                    const preferenceCount = await RoomPreferences.countDocuments({
                        user_id: userId,
                        $or: [
                            { status: 'active' },
                            { status: { $exists: false } },
                        ],
                    }).session(session);
                    if (preferenceCount >= MAX_ACTIVE_ROOM_PREFERENCES) {
                        throw new Error('MAX_ACTIVE_ROOM_PREFERENCES');
                    }
                    const challengerRank = preferenceCount + 1;

                    const currentRoomHolder = await RoomPreferences.findOne({
                        housing_room_id: roomId,
                        rank: challengerRank,
                        $or: [
                            { status: 'active' },
                            { status: { $exists: false } },
                        ],
                    }).session(session);

                    if (
                        currentRoomHolder &&
                        currentRoomHolder.user_id !== userId
                    ) {
                        const incumbentPriority =
                            await RoomDrawParticipants.findOne({
                                user_id: currentRoomHolder.user_id,
                            })
                                .session(session)
                                .lean();

                        if (
                            incumbentPriority &&
                            !isBetterRoomDrawPriority(
                                challengerPriority,
                                incumbentPriority,
                                room.eligibleYear
                            )
                        ) {
                            throw new Error('ROOM_PRIORITY_CONFLICT');
                        }

                        const bumpedPreferenceCount =
                            await RoomPreferences.countDocuments({
                                user_id: currentRoomHolder.user_id,
                                status: 'bumped',
                            }).session(session);
                        currentRoomHolder.status = 'bumped';
                        currentRoomHolder.rank = 1000 + bumpedPreferenceCount;
                        currentRoomHolder.bumpedByUserId = userId;
                        currentRoomHolder.bumpedByEmail = userEmail;
                        currentRoomHolder.bumpedByName =
                            getSessionUserName(sessionUser);
                        currentRoomHolder.bumpedByClassYear =
                            challengerPriority.classYear;
                        currentRoomHolder.bumpedByDrawDate =
                            challengerPriority.drawDate;
                        currentRoomHolder.bumpedAt = new Date();
                        bumpedPreference = await currentRoomHolder.save({
                            session,
                        });
                    }

                    await RoomPreferences.deleteOne(
                        {
                            user_id: userId,
                            housing_room_id: roomId,
                            status: 'bumped',
                        },
                        { session }
                    );

                    const [createdPreference] = await RoomPreferences.create(
                        [
                            {
                                user_id: userId,
                                user_email: userEmail,
                                user_name: getSessionUserName(sessionUser),
                                housing_room_id: roomId,
                                rank: challengerRank,
                                status: 'active',
                            },
                        ],
                        { session }
                    );
                    preference = createdPreference;
                });
            } catch (error) {
                if (
                    error instanceof Error &&
                    error.message === 'MAX_ACTIVE_ROOM_PREFERENCES'
                ) {
                    res.status(400).json({
                        message: 'You can rank up to 2 rooms',
                    });
                    return;
                }

                if (
                    error instanceof Error &&
                    error.message === 'ROOM_PRIORITY_CONFLICT'
                ) {
                    res.status(409).json({
                        message:
                            'Room is already ranked by someone with better priority',
                    });
                    return;
                }

                if (
                    typeof error === 'object' &&
                    error !== null &&
                    'code' in error &&
                    error.code === 11000
                ) {
                    res.status(409).json({
                        message:
                            'Room ranking changed while you were updating. Please try again.',
                    });
                    return;
                }

                throw error;
            } finally {
                await session.endSession();
            }

            broadcastRoomPreferenceEvent([room.housing_building_id]);
            broadcastUserPreferenceEvent(
                [
                    userId,
                    bumpedPreference
                        ? (bumpedPreference as { user_id: string }).user_id
                        : null,
                ].filter((id): id is string => Boolean(id))
            );

            res.status(alreadyInPreferences ? 200 : 201).json({
                message: bumpedPreference
                    ? 'Room added to preferences and previous rank owner was bumped'
                    : alreadyInPreferences
                      ? 'Room is already in your preferences'
                    : 'Room added to preferences',
                preference,
                bumpedPreference,
            });
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   DELETE /api/campus/housing/room-preferences/rooms/:roomId
 * @desc    Remove a room from the signed-in user's ranked preference list
 * @access  isAuthenticated
 */
router.delete(
    '/room-preferences/rooms/:roomId',
    isAuthenticated,
    async (req: Request, res: Response) => {
        try {
            const settings = await getRoomDrawSettingsPayload();
            if (!settings.isVisible) {
                res.status(403).json({
                    message: 'Room ranking is only available during room draw',
                });
                return;
            }

            if (await requiresRoomDrawPriority(req)) {
                res.status(403).json({
                    message: 'Enter your draw priority before using room ranking',
                });
                return;
            }

            const userId = getSessionUserId(req);
            const userEmail = getSessionUserEmail(req);
            if (!userId || !userEmail) {
                res.status(401).json({ message: 'Authentication required' });
                return;
            }

            const roomId = parseInt(getParam(req.params.roomId), 10);
            if (isNaN(roomId)) {
                res.status(400).json({ message: 'Invalid room ID format' });
                return;
            }

            const removedRoom = (await HousingRooms.findOne({ id: roomId })
                .select('housing_building_id')
                .lean()) as { housing_building_id: number } | null;
            await RoomPreferences.deleteOne({
                user_id: userId,
                housing_room_id: roomId,
                $or: [{ status: 'active' }, { status: { $exists: false } }],
            });

            const remainingPreferences = await RoomPreferences.find({
                user_id: userId,
                $or: [{ status: 'active' }, { status: { $exists: false } }],
            }).sort({ rank: 1 });

            await Promise.all(
                remainingPreferences.map((preference, index) => {
                    preference.rank = index + 1;
                    return preference.save();
                })
            );

            const changedRoomIds = [
                roomId,
                ...remainingPreferences.map(
                    (preference) => preference.housing_room_id
                ),
            ];
            const buildingIds = await getBuildingIdsForRoomIds(changedRoomIds);
            if (removedRoom) {
                buildingIds.push(removedRoom.housing_building_id);
            }
            broadcastRoomPreferenceEvent(buildingIds);
            broadcastUserPreferenceEvent([userId]);

            res.json({ message: 'Room removed from preferences' });
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   GET /api/campus/housing/admin/room-preferences/summary
 * @desc    Get aggregate room preference demand for admins
 * @access  Admin
 */
router.get(
    '/admin/room-preferences/summary',
    isAdmin,
    async (_req: Request, res: Response) => {
        try {
            const summary = await RoomPreferences.aggregate([
                {
                    $match: {
                        $or: [
                            { status: 'active' },
                            { status: { $exists: false } },
                        ],
                    },
                },
                {
                    $group: {
                        _id: '$housing_room_id',
                        preferenceCount: { $sum: 1 },
                        averageRank: { $avg: '$rank' },
                        topRank: { $min: '$rank' },
                    },
                },
                { $sort: { preferenceCount: -1, averageRank: 1 } },
            ]);

            const roomIds = summary.map((item) => item._id);
            const rooms = await HousingRooms.find({
                id: { $in: roomIds },
            }).lean();
            const buildings = await HousingBuildings.find({
                id: { $in: rooms.map((room) => room.housing_building_id) },
            }).lean();
            const roomsById = new Map(rooms.map((room) => [room.id, room]));
            const buildingsById = new Map(
                buildings.map((building) => [building.id, building])
            );

            res.json(
                summary.map((item) => {
                    const room = roomsById.get(item._id);
                    const building = room
                        ? buildingsById.get(room.housing_building_id)
                        : null;

                    return {
                        housing_room_id: item._id,
                        preferenceCount: item.preferenceCount,
                        averageRank: item.averageRank,
                        topRank: item.topRank,
                        room,
                        building,
                    };
                })
            );
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   GET /api/campus/housing/:building/room-preferences/holders
 * @desc    Get active ranked room holders for a building
 * @access  isAuthenticated
 */
router.get(
    '/:building/room-preferences/events',
    isAuthenticated,
    async (req: Request, res: Response) => {
        const buildingId = parseInt(getParam(req.params.building), 10);

        if (isNaN(buildingId)) {
            res.status(400).json({ message: 'Invalid building ID format' });
            return;
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        if (!roomPreferenceSubscribers.has(buildingId)) {
            roomPreferenceSubscribers.set(buildingId, new Set());
        }

        const subscribers = roomPreferenceSubscribers.get(buildingId)!;
        subscribers.add(res);
        sendSseEvent(res, 'connected', { buildingId });

        const keepAlive = setInterval(() => {
            res.write(': keep-alive\n\n');
        }, 25000);

        req.on('close', () => {
            clearInterval(keepAlive);
            subscribers.delete(res);
            if (subscribers.size === 0) {
                roomPreferenceSubscribers.delete(buildingId);
            }
        });
    }
);

router.get(
    '/:building/room-preferences/holders',
    isAuthenticated,
    async (req: Request, res: Response) => {
        try {
            const buildingId = parseInt(getParam(req.params.building), 10);
            if (isNaN(buildingId)) {
                res.status(400).json({ message: 'Invalid building ID format' });
                return;
            }

            const settings = await getRoomDrawSettingsPayload();
            if (!settings.isVisible) {
                res.status(403).json({
                    message: 'Room ranking is only available during room draw',
                });
                return;
            }

            if (await requiresRoomDrawPriority(req)) {
                res.status(403).json({
                    message: 'Enter your draw priority before using room ranking',
                });
                return;
            }

            const rooms = await HousingRooms.find({
                housing_building_id: buildingId,
            }).lean();
            const roomIds = rooms.map((room) => room.id);
            const preferences = await RoomPreferences.find({
                housing_room_id: { $in: roomIds },
                $or: [{ status: 'active' }, { status: { $exists: false } }],
            }).lean();
            const participants = await RoomDrawParticipants.find({
                user_id: { $in: preferences.map((preference) => preference.user_id) },
            }).lean();
            const participantsByUserId = new Map(
                participants.map((participant) => [
                    participant.user_id,
                    participant,
                ])
            );

            const holders = preferences.reduce<
                Record<
                    number,
                    Array<{
                        initials: string;
                        name?: string;
                        rank?: number;
                        classYear?: number;
                        drawDate?: Date;
                        isOwner: boolean;
                    }>
                >
            >((acc, preference) => {
                const priority = participantsByUserId.get(preference.user_id);
                if (!acc[preference.housing_room_id]) {
                    acc[preference.housing_room_id] = [];
                }

                acc[preference.housing_room_id].push({
                    initials: getInitials(
                        preference.user_name,
                        preference.user_email
                    ),
                    name: preference.user_name,
                    rank: preference.rank,
                    classYear: priority?.classYear,
                    drawDate: priority?.drawDate,
                    isOwner: preference.user_id === req.session.user?.id,
                });
                return acc;
            }, {});

            res.json(holders);
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   GET /api/campus/housing/:building
 * @desc    Get housing building by id
 * @access  Public
 */
router.get(
    '/:building',
    async (req: Request, res: Response) => {
        try {
            // Get building id
            const buildingId = parseInt(getParam(req.params.building), 10);

            // Check if conversion is valid
            if (isNaN(buildingId)) {
                res.status(400).json({ message: 'Invalid building ID format' });
                return;
            }

            // Find building by id
            const buildingData = await HousingBuildings.findOne({
                id: buildingId,
            });
            if (!buildingData) {
                res.status(404).json({ message: 'Building not found' });
                return;
            }

            // Return building
            res.json(buildingData);
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   GET /campus/housing/:building/rooms
 * @desc    Get all roms in a building (by building id)
 * @access  Public
 */
router.get(
    '/:building/rooms',
    async (req: Request, res: Response) => {
        try {
            // Get building id
            const buildingId = parseInt(getParam(req.params.building), 10);

            // Check if conversion is valid
            if (isNaN(buildingId)) {
                res.status(400).json({ message: 'Invalid building ID format' });
                return;
            }

            // Get all rooms in the building
            const rooms = await HousingRooms.find({
                housing_building_id: buildingId,
            }).sort({ room_number: 1 });

            if (!rooms || rooms.length === 0) {
                res.status(404).json({ message: 'Rooms not found' });
                return;
            }

            res.json(rooms);
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   GET /api/campus/:room/reviews
 * @desc    Get housing reviews for a room
 * @access  isAuthenticated
 */
router.get(
    '/:room/reviews',
    isAuthenticated,
    async (req: Request, res: Response) => {
        try {
            // Get room id and convert it to a number
            const roomId = parseInt(getParam(req.params.room), 10);

            // Check if conversion is valid
            if (isNaN(roomId)) {
                res.status(400).json({ message: 'Invalid room ID format' });
                return;
            }

            // Find the room by room id
            const roomData = await HousingRooms.findOne({ id: roomId });

            if (!roomData) {
                res.status(404).json({ message: 'Room not found' });
                return;
            }

            // Get all reviews for the room
            const reviews = await HousingReviews.find({
                housing_room_id: roomId,
            }).lean();

            const sessionUserId = req.session.user!.id;
            const safeReviews = reviews.map(({ user_id, user_email, ...fields }) => ({
                ...fields,
                isOwner: user_id === sessionUserId,
            }));

            // Calculate average ratings
            if (reviews.length > 0) {
                const overallRatings = reviews
                    .map((r) => r.overall_rating)
                    .filter(Boolean) as number[];
                const quietRatings = reviews
                    .map((r) => r.quiet_rating)
                    .filter(Boolean) as number[];
                const layoutRatings = reviews
                    .map((r) => r.layout_rating)
                    .filter(Boolean) as number[];
                const temperatureRatings = reviews
                    .map((r) => r.temperature_rating)
                    .filter(Boolean) as number[];

                const calcAverage = (arr: number[]) =>
                    arr.length > 0
                        ? arr.reduce((sum, val) => sum + val, 0) / arr.length
                        : 0;

                const averages = {
                    overallAverage: calcAverage(overallRatings),
                    quietAverage: calcAverage(quietRatings),
                    layoutAverage: calcAverage(layoutRatings),
                    temperatureAverage: calcAverage(temperatureRatings),
                    reviewCount: reviews.length,
                };

                // Return reviews and averages as well as the room data itself
                res.json({
                    room: roomData,
                    reviews: safeReviews,
                    averages: averages,
                });
                return;
            }

            // Return reviews (even if empty)
            res.json({
                room: roomData,
                reviews: safeReviews,
                averages: {
                    overallAverage: 0,
                    quietAverage: 0,
                    layoutAverage: 0,
                    temperatureAverage: 0,
                    reviewCount: 0,
                },
            });
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   GET /api/campus/housing/:buildingId/:roomNumber/reviews
 * @desc    Get reviews for a room by building id and room number
 * @access  isAuthenticated
 */
router.get(
    '/:buildingId/:roomNumber/reviews',
    isAuthenticated,
    async (req: Request, res: Response) => {
        try {
            // Get room id and convert it to a number
            const buildingId = getParam(req.params.buildingId);
            const roomNumber = getParam(req.params.roomNumber);
            const buildingIdNumber = parseInt(buildingId, 10);

            // Find the room by building and room number
            if (isNaN(buildingIdNumber)) {
                res.status(400).json({ message: 'Invalid building ID format' });
                return;
            }

            const roomData = await HousingRooms.findOne({
                housing_building_id: buildingIdNumber,
                room_number: roomNumber,
            });

            if (!roomData) {
                res.status(404).json({ message: 'Room not found' });
                return;
            }

            // Get all reviews for the room using room id
            const reviews = await HousingReviews.find({
                housing_room_id: roomData.id,
            }).lean();

            const sessionUserId = req.session.user!.id;
            const safeReviews = reviews.map(({ user_id, user_email, ...fields }) => ({
                ...fields,
                isOwner: user_id === sessionUserId,
            }));

            // Calculate average ratings
            if (reviews.length > 0) {
                const overallRatings = reviews
                    .map((r) => r.overall_rating)
                    .filter(Boolean) as number[];
                const quietRatings = reviews
                    .map((r) => r.quiet_rating)
                    .filter(Boolean) as number[];
                const layoutRatings = reviews
                    .map((r) => r.layout_rating)
                    .filter(Boolean) as number[];
                const temperatureRatings = reviews
                    .map((r) => r.temperature_rating)
                    .filter(Boolean) as number[];

                const calcAverage = (arr: number[]) =>
                    arr.length > 0
                        ? arr.reduce((sum, val) => sum + val, 0) / arr.length
                        : 0;

                const averages = {
                    overallAverage: calcAverage(overallRatings),
                    quietAverage: calcAverage(quietRatings),
                    layoutAverage: calcAverage(layoutRatings),
                    temperatureAverage: calcAverage(temperatureRatings),
                    reviewCount: reviews.length,
                };

                // Return reviews and averages as well as the room data itself
                res.json({
                    room: roomData,
                    reviews: safeReviews,
                    averages: averages,
                });
                return;
            }

            // Return reviews (even if empty)
            res.json({
                room: roomData,
                reviews: safeReviews,
                averages: {
                    overallAverage: 0,
                    quietAverage: 0,
                    layoutAverage: 0,
                    temperatureAverage: 0,
                    reviewCount: 0,
                },
            });
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   POST /api/campus/housing/:buildingId/:roomNumber/reviews
 * @desc    Add new housing room review
 * @access  isAuthenticated
 */
router.post(
    '/:buildingId/:roomNumber/reviews',
    isAuthenticated,
    async (req: Request, res: Response) => {
        try {
            // need to find new max id for the new review
            const result = await HousingReviews.aggregate([
                {
                    $group: {
                        _id: null, // No need to group, so _id is null
                        maxValue: { $max: '$id' }, // Find the max value of fieldName
                    },
                },
            ]);

            const maxId = (result[0]?.maxValue || 0) + 1;

            // Find room id by building and room number
            const buildingId = getParam(req.params.buildingId);
            const roomNumber = getParam(req.params.roomNumber);
            const buildingIdNumber = parseInt(buildingId, 10);

            if (isNaN(buildingIdNumber)) {
                res.status(400).json({ message: 'Invalid building ID format' });
                return;
            }

            const roomData = await HousingRooms.findOne({
                housing_building_id: buildingIdNumber,
                room_number: roomNumber,
            });

            if (!roomData) {
                res.status(404).json({ message: 'Room not found' });
                return;
            }

            const parsedReview = parseReviewPayload(req.body);
            if ('message' in parsedReview) {
                res.status(400).json({ message: parsedReview.message });
                return;
            }

            // construct review data
            const reviewData = {
                id: maxId,
                overall_rating: parsedReview.value.overall,
                quiet_rating: parsedReview.value.quiet,
                layout_rating: parsedReview.value.layout,
                temperature_rating: parsedReview.value.temperature,
                comments: parsedReview.value.comments,
                housing_room_id: roomData.id,
                user_id: req.session.user!.id,
                user_email: req.session.user!.email,
            };

            const review = new HousingReviews(reviewData);
            await review.save();

            res.status(201).json({ message: 'Review saved successfully' });
        } catch (error) {
            console.error('Review create error:', error);
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   PATCH /api/campus/housing/reviews/:id
 * @desc    Update housing review by review id
 * @access  isHousingReviewOwner
 */
router.patch(
    '/reviews/:reviewId',
    isHousingReviewOwner,
    async (req: Request, res: Response) => {
        try {
            if (!req.body) {
                return;
            }

            const reviewId = Number(getParam(req.params.reviewId));
            const oldReview = await HousingReviews.findOne({ id: reviewId });

            if (!oldReview) {
                console.log('cant find old review');
                res.status(404).json({ message: 'Review not found' });
                return;
            }

            const parsedReview = parseReviewPayload(req.body);
            if ('message' in parsedReview) {
                res.status(400).json({ message: parsedReview.message });
                return;
            }

            // construct review data
            let updateData = {
                overall_rating: parsedReview.value.overall,
                quiet_rating: parsedReview.value.quiet,
                layout_rating: parsedReview.value.layout,
                temperature_rating: parsedReview.value.temperature,
                comments: parsedReview.value.comments,
            };

            const updatedReview = await HousingReviews.findOneAndUpdate(
                { id: reviewId },
                updateData,
                { new: true }
            );
            res.status(200).json({
                message: 'Review updated',
                updatedReview,
            });
        } catch (error) {
            console.error('update error: ', error);
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   DELETE /api/campus/housing/reviews/:id
 * @desc    Delete housing room review
 * @access  isHousingReviewOwner
 */
router.delete(
    '/reviews/:reviewId',
    isHousingReviewOwner,
    async (req: Request, res: Response) => {
        try {
            const review = await HousingReviews.findOneAndDelete({
                id: Number(getParam(req.params.reviewId)),
            });

            if (!review) {
                res.status(404).json({ message: 'Review not found' });
                return;
            }

            res.status(200).json({ message: 'Review deleted' });
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

/**
 * @route   GET /api/campus/housing/:building/ratings
 * @desc    Get ratings for all rooms in a building
 * @access  Public
 */
router.get(
    '/:building/ratings',
    async (req: Request, res: Response) => {
        try {
            const buildingId = parseInt(getParam(req.params.building), 10);
            if (isNaN(buildingId)) {
                res.status(400).json({ message: 'Invalid building ID format' });
                return;
            }

            // Get all rooms for the building
            const rooms = await HousingRooms.find({
                housing_building_id: buildingId,
            });
            if (!rooms || rooms.length === 0) {
                res.json({});
                return;
            }

            const roomIds = rooms.map((r) => r.id);

            // Fetch all reviews for all rooms in one query
            const allReviews = await HousingReviews.find({
                housing_room_id: { $in: roomIds },
            });

            // Group reviews by room id and calculate averages
            const calcAverage = (arr: number[]) =>
                arr.length > 0
                    ? arr.reduce((sum, val) => sum + val, 0) / arr.length
                    : 0;

            const ratingsMap: Record<
                number,
                { overallAverage: number; reviewCount: number }
            > = {};

            for (const room of rooms) {
                const roomReviews = allReviews.filter(
                    (r) => r.housing_room_id === room.id
                );
                const overallRatings = roomReviews
                    .map((r) => r.overall_rating)
                    .filter(Boolean) as number[];
                ratingsMap[room.id] = {
                    overallAverage: calcAverage(overallRatings),
                    reviewCount: roomReviews.length,
                };
            }

            res.json(ratingsMap);
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

export default router;
