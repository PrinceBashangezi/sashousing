import mongoose, { Document, Schema } from 'mongoose';

// Housing Buildings Schema
interface IHousingBuildings extends Document {
    id: number;
    name: string;
    campus: string;
    floors: number;
    eligibleYear?: number;
    description?: string;
}

const HousingBuildingsSchema = new Schema<IHousingBuildings>({
    id: {
        type: Number,
        required: true,
        unique: true,
    },
    name: {
        type: String,
        required: true,
        unique: true,
    },
    campus: {
        type: String,
        required: true,
    },
    floors: {
        type: Number,
        default: 1,
        required: true,
    },
    eligibleYear: {
        type: Number,
        min: 1,
        max: 4,
    },
    description: {
        type: String,
    },
});

const HousingBuildings =
    mongoose.models.HousingBuildings ||
    mongoose.model<IHousingBuildings>('HousingBuildings', HousingBuildingsSchema);

// Housing Rooms Schema
interface IHousingRooms extends Document {
    id: number;
    size?: number;
    occupancy_type?: number;
    closet_type?: number;
    bathroom_type?: number;
    floor?: number;
    eligibleYear?: number;
    sink?: boolean;
    closet?: boolean;
    closetType?: string;
    balcony?: boolean;
    privateBath?: boolean;
    suiteBath?: boolean;
    note?: string;
    // housing_suite_id?: number; // TODO: DELETE
    housing_building_id: number;
    room_number: string;
}

const HousingRoomsSchema = new Schema<IHousingRooms>({
    id: {
        type: Number,
        required: true,
        unique: true,
    },
    size: {
        type: Number,
    },
    occupancy_type: {
        type: Number,
    },
    closet_type: {
        type: Number,
    },
    bathroom_type: {
        type: Number,
    },
    floor: {
        type: Number,
        min: 1,
    },
    eligibleYear: {
        type: Number,
        min: 1,
        max: 4,
    },
    sink: {
        type: Boolean,
    },
    closet: {
        type: Boolean,
    },
    closetType: {
        type: String,
        trim: true,
        maxlength: 80,
    },
    balcony: {
        type: Boolean,
    },
    privateBath: {
        type: Boolean,
    },
    suiteBath: {
        type: Boolean,
    },
    note: {
        type: String,
        trim: true,
        maxlength: 300,
    },
    // housing_suite_id: { // TODO: DELETE
    //     type: Number,
    //     ref: 'HousingSuites',
    //     index: true
    // },
    housing_building_id: {
        type: Number,
        required: true,
        ref: 'HousingBuildings',
        index: true,
    },
    room_number: {
        type: String,
        required: true,
    },
});

const HousingRooms =
    mongoose.models.HousingRooms ||
    mongoose.model<IHousingRooms>('HousingRooms', HousingRoomsSchema);

// Housing Reviews Schema
interface IHousingReviews extends Document {
    id: number;
    overall_rating?: number;
    quiet_rating?: number;
    layout_rating?: number;
    temperature_rating?: number;
    comments?: string;
    housing_room_id: number;
    user_id: string;
    user_email: string;
}

const HousingReviewsSchema = new Schema<IHousingReviews>(
    {
        id: {
            type: Number,
            required: true,
            unique: true,
        },
        overall_rating: {
            type: Number,
        },
        quiet_rating: {
            type: Number,
        },
        layout_rating: {
            type: Number,
        },
        temperature_rating: {
            type: Number,
        },
        comments: {
            type: String,
        },
        housing_room_id: {
            type: Number,
            ref: 'HousingRooms',
            required: true,
            index: true,
        },
        user_id: {
            type: String,
            required: true,
            index: true,
        },
        user_email: {
            type: String,
            lowercase: true,
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

const HousingReviews =
    mongoose.models.HousingReviews ||
    mongoose.model<IHousingReviews>('HousingReviews', HousingReviewsSchema);

interface IRoomDrawSettings extends Document {
    key: string;
    startsAt?: Date;
    endsAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const RoomDrawSettingsSchema = new Schema<IRoomDrawSettings>(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            default: 'global',
        },
        startsAt: {
            type: Date,
        },
        endsAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
    }
);

const RoomDrawSettings =
    (mongoose.models.RoomDrawSettings as mongoose.Model<IRoomDrawSettings>) ||
    mongoose.model<IRoomDrawSettings>(
        'RoomDrawSettings',
        RoomDrawSettingsSchema
    );

interface IRoomDrawParticipant extends Document {
    user_id: string;
    user_email: string;
    user_name?: string;
    classYear: number;
    drawDate: Date;
    createdAt: Date;
    updatedAt: Date;
}

const RoomDrawParticipantSchema = new Schema<IRoomDrawParticipant>(
    {
        user_id: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        user_email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        user_name: {
            type: String,
        },
        classYear: {
            type: Number,
            required: true,
            min: 1,
            max: 4,
        },
        drawDate: {
            type: Date,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

const RoomDrawParticipants =
    (mongoose.models
        .RoomDrawParticipants as mongoose.Model<IRoomDrawParticipant>) ||
    mongoose.model<IRoomDrawParticipant>(
        'RoomDrawParticipants',
        RoomDrawParticipantSchema
    );

interface IRoomDrawStatus extends Document {
    housing_room_id: number;
    status: 'taken';
    markedByUserId: string;
    markedByEmail: string;
    markedByName?: string;
    createdAt: Date;
    updatedAt: Date;
}

const RoomDrawStatusSchema = new Schema<IRoomDrawStatus>(
    {
        housing_room_id: {
            type: Number,
            required: true,
            unique: true,
            ref: 'HousingRooms',
            index: true,
        },
        status: {
            type: String,
            enum: ['taken'],
            default: 'taken',
            required: true,
        },
        markedByUserId: {
            type: String,
            required: true,
            index: true,
        },
        markedByEmail: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        markedByName: {
            type: String,
        },
    },
    {
        timestamps: true,
    }
);

const RoomDrawStatuses =
    (mongoose.models.RoomDrawStatuses as mongoose.Model<IRoomDrawStatus>) ||
    mongoose.model<IRoomDrawStatus>(
        'RoomDrawStatuses',
        RoomDrawStatusSchema
    );

interface IRoomPreference extends Document {
    user_id: string;
    user_email: string;
    user_name?: string;
    housing_room_id: number;
    rank: number;
    notes?: string;
    status: 'active' | 'bumped';
    bumpedByUserId?: string;
    bumpedByEmail?: string;
    bumpedByName?: string;
    bumpedByClassYear?: number;
    bumpedByDrawDate?: Date;
    bumpedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const RoomPreferenceSchema = new Schema<IRoomPreference>(
    {
        user_id: {
            type: String,
            required: true,
            index: true,
        },
        user_email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        user_name: {
            type: String,
        },
        housing_room_id: {
            type: Number,
            required: true,
            ref: 'HousingRooms',
            index: true,
        },
        rank: {
            type: Number,
            required: true,
            min: 1,
        },
        notes: {
            type: String,
        },
        status: {
            type: String,
            enum: ['active', 'bumped'],
            default: 'active',
            required: true,
            index: true,
        },
        bumpedByUserId: {
            type: String,
        },
        bumpedByEmail: {
            type: String,
            lowercase: true,
            trim: true,
        },
        bumpedByName: {
            type: String,
        },
        bumpedByClassYear: {
            type: Number,
            min: 1,
            max: 4,
        },
        bumpedByDrawDate: {
            type: Date,
        },
        bumpedAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
    }
);

RoomPreferenceSchema.index(
    { user_id: 1, housing_room_id: 1, status: 1 },
    { unique: true }
);
RoomPreferenceSchema.index(
    { user_id: 1, rank: 1 },
    { unique: true, partialFilterExpression: { status: 'active' } }
);
RoomPreferenceSchema.index(
    { housing_room_id: 1, rank: 1 },
    { unique: true, partialFilterExpression: { status: 'active' } }
);
const RoomPreferences =
    (mongoose.models.RoomPreferences as mongoose.Model<IRoomPreference>) ||
    mongoose.model<IRoomPreference>('RoomPreferences', RoomPreferenceSchema);

export {
    HousingBuildings,
    HousingRooms,
    HousingReviews,
    RoomDrawSettings,
    RoomDrawParticipants,
    RoomDrawStatuses,
    RoomPreferences,
};
