import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { Prisma } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { UploadMediaDTO } from './dto/upload-media.dto';

@Injectable()
export class MediaService {
    constructor(private readonly prisma: PrismaService) { }

    private getMediaTypeFromMime(mimeType: string) {
        if (mimeType.startsWith('image/')) return 'image';
        if (mimeType.startsWith('video/')) return 'video';
        if (mimeType.startsWith('audio/')) return 'audio';
        return 'file';
    }

    private validateFile(file: Express.Multer.File) {
        if (!file) {
            throw new BadRequestException('Debes enviar un archivo');
        }

        const allowedMimeTypes = [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/jpg',
            'video/mp4',
            'audio/mpeg',
            'audio/mp3',
            'audio/wav',
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
            throw new BadRequestException('Tipo de archivo no permitido');
        }
    }

    private async ensureStudioOwner(
        tx: Prisma.TransactionClient,
        userId: string,
        studioId: string,
    ) {
        const studio = await tx.studios.findUnique({
            where: {
                studio_id: studioId,
            },
            select: {
                studio_id: true,
                owner_user_id: true,
            },
        });

        if (!studio) {
            throw new NotFoundException('Estudio no encontrado');
        }

        if (studio.owner_user_id !== userId) {
            throw new ForbiddenException(
                'No tienes permisos para administrar este estudio',
            );
        }

        return studio;
    }

    private async ensureRoomOwner(
        tx: Prisma.TransactionClient,
        userId: string,
        roomId: string,
    ) {
        const room = await tx.rehearsal_rooms.findUnique({
            where: {
                room_id: roomId,
            },
            select: {
                room_id: true,
                studio_id: true,
                studios: {
                    select: {
                        owner_user_id: true,
                    },
                },
            },
        });

        if (!room) {
            throw new NotFoundException('Sala no encontrada');
        }

        if (room.studios.owner_user_id !== userId) {
            throw new ForbiddenException(
                'No tienes permisos para administrar esta sala',
            );
        }

        return room;
    }

    private async createMediaRecord(
        tx: Prisma.TransactionClient,
        userId: string,
        file: Express.Multer.File,
    ) {
        return tx.media.create({
            data: {
                url: `/uploads/media/${file.filename}`,
                provider: 'local',
                storage_key: file.filename,
                original_filename: file.originalname,
                media_type: this.getMediaTypeFromMime(file.mimetype),
                mime_type: file.mimetype,
                size_bytes: BigInt(file.size),
                uploaded_by: userId,
                status: 'READY',
            },
            select: {
                media_id: true,
                url: true,
                provider: true,
                storage_key: true,
                original_filename: true,
                media_type: true,
                mime_type: true,
                size_bytes: true,
                uploaded_by: true,
                status: true,
                created_at: true,
            },
        });
    }

    private async deletePhysicalFile(storageKey?: string | null) {
        if (!storageKey) return;

        const fullPath = join(process.cwd(), 'uploads', 'media', storageKey);

        try {
            await unlink(fullPath);
        } catch {
        }
    }

    private async deleteMediaIfOrphan(
        tx: Prisma.TransactionClient,
        mediaId: string,
    ) {
        const media = await tx.media.findUnique({
            where: {
                media_id: mediaId,
            },
            select: {
                storage_key: true,
                _count: {
                    select: {
                        user_media: true,
                        studio_media: true,
                        room_media: true,
                        post_media: true,
                        message_attachments: true,
                    },
                },
            },
        });

        if (!media) {
            return null;
        }

        const totalRefs =
            media._count.user_media +
            media._count.studio_media +
            media._count.room_media +
            media._count.post_media +
            media._count.message_attachments;

        if (totalRefs > 0) {
            return null;
        }

        await tx.media.delete({
            where: {
                media_id: mediaId,
            },
        });

        return media.storage_key;
    }

    async uploadUserMedia(
        userId: string,
        file: Express.Multer.File,
        dto: UploadMediaDTO,
    ) {
        this.validateFile(file);

        try {
            return await this.prisma.$transaction(async (tx) => {
                const media = await this.createMediaRecord(tx, userId, file);

                await tx.user_media.create({
                    data: {
                        user_id: userId,
                        media_id: media.media_id,
                        kind: dto.kind,
                        sort_order: dto.sort_order ?? 0,
                    },
                });

                return {
                    message: 'Archivo subido correctamente',
                    media,
                };
            });
        } catch (error) {
            await this.deletePhysicalFile(file.filename);
            throw new InternalServerErrorException('Error al subir la media');
        }
    }

    async listUserMedia(userId: string) {
        return this.prisma.user_media.findMany({
            where: {
                user_id: userId,
            },
            select: {
                kind: true,
                sort_order: true,
                created_at: true,
                media: {
                    select: {
                        media_id: true,
                        url: true,
                        original_filename: true,
                        media_type: true,
                        mime_type: true,
                        size_bytes: true,
                        created_at: true,
                    },
                },
            },
            orderBy: [
                { sort_order: 'asc' },
                { created_at: 'asc' },
            ],
        });
    }

    async deleteUserMedia(userId: string, mediaId: string) {
        let storageKeyToDelete: string | null = null;

        try {
            await this.prisma.$transaction(async (tx) => {
                const relation = await tx.user_media.findFirst({
                    where: {
                        user_id: userId,
                        media_id: mediaId,
                    },
                    select: {
                        media_id: true,
                    },
                });

                if (!relation) {
                    throw new NotFoundException('Media no encontrada para este usuario');
                }

                await tx.user_media.deleteMany({
                    where: {
                        user_id: userId,
                        media_id: mediaId,
                    },
                });

                storageKeyToDelete = await this.deleteMediaIfOrphan(tx, mediaId);
            });

            if (storageKeyToDelete) {
                await this.deletePhysicalFile(storageKeyToDelete);
            }

            return {
                message: 'Media eliminada correctamente',
            };
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }

            throw new InternalServerErrorException('Error al eliminar la media');
        }
    }

    async uploadStudioMedia(
        userId: string,
        studioId: string,
        file: Express.Multer.File,
        dto: UploadMediaDTO,
    ) {
        this.validateFile(file);

        try {
            return await this.prisma.$transaction(async (tx) => {
                await this.ensureStudioOwner(tx, userId, studioId);

                const media = await this.createMediaRecord(tx, userId, file);

                await tx.studio_media.create({
                    data: {
                        studio_id: studioId,
                        media_id: media.media_id,
                        kind: dto.kind,
                        sort_order: dto.sort_order ?? 0,
                    },
                });

                return {
                    message: 'Media del estudio subida correctamente',
                    media,
                };
            });
        } catch (error) {
            await this.deletePhysicalFile(file.filename);

            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException
            ) {
                throw error;
            }

            throw new InternalServerErrorException(
                'Error al subir la media del estudio',
            );
        }
    }

    async listStudioMedia(studioId: string) {
        const studio = await this.prisma.studios.findUnique({
            where: {
                studio_id: studioId,
            },
            select: {
                studio_id: true,
            },
        });

        if (!studio) {
            throw new NotFoundException('Estudio no encontrado');
        }

        return this.prisma.studio_media.findMany({
            where: {
                studio_id: studioId,
            },
            select: {
                kind: true,
                sort_order: true,
                created_at: true,
                media: {
                    select: {
                        media_id: true,
                        url: true,
                        original_filename: true,
                        media_type: true,
                        mime_type: true,
                        size_bytes: true,
                        created_at: true,
                    },
                },
            },
            orderBy: [
                { sort_order: 'asc' },
                { created_at: 'asc' },
            ],
        });
    }

    async deleteStudioMedia(userId: string, studioId: string, mediaId: string) {
        let storageKeyToDelete: string | null = null;

        try {
            await this.prisma.$transaction(async (tx) => {
                await this.ensureStudioOwner(tx, userId, studioId);

                const relation = await tx.studio_media.findFirst({
                    where: {
                        studio_id: studioId,
                        media_id: mediaId,
                    },
                    select: {
                        media_id: true,
                    },
                });

                if (!relation) {
                    throw new NotFoundException('Media no encontrada para este estudio');
                }

                await tx.studio_media.deleteMany({
                    where: {
                        studio_id: studioId,
                        media_id: mediaId,
                    },
                });

                storageKeyToDelete = await this.deleteMediaIfOrphan(tx, mediaId);
            });

            if (storageKeyToDelete) {
                await this.deletePhysicalFile(storageKeyToDelete);
            }

            return {
                message: 'Media del estudio eliminada correctamente',
            };
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException
            ) {
                throw error;
            }

            throw new InternalServerErrorException(
                'Error al eliminar la media del estudio',
            );
        }
    }

    async uploadRoomMedia(
        userId: string,
        roomId: string,
        file: Express.Multer.File,
        dto: UploadMediaDTO,
    ) {
        this.validateFile(file);

        try {
            return await this.prisma.$transaction(async (tx) => {
                await this.ensureRoomOwner(tx, userId, roomId);

                const media = await this.createMediaRecord(tx, userId, file);

                await tx.room_media.create({
                    data: {
                        room_id: roomId,
                        media_id: media.media_id,
                        kind: dto.kind,
                        sort_order: dto.sort_order ?? 0,
                    },
                });

                return {
                    message: 'Media de la sala subida correctamente',
                    media,
                };
            });
        } catch (error) {
            await this.deletePhysicalFile(file.filename);

            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException
            ) {
                throw error;
            }

            throw new InternalServerErrorException(
                'Error al subir la media de la sala',
            );
        }
    }

    async listRoomMedia(roomId: string) {
        const room = await this.prisma.rehearsal_rooms.findUnique({
            where: {
                room_id: roomId,
            },
            select: {
                room_id: true,
            },
        });

        if (!room) {
            throw new NotFoundException('Sala no encontrada');
        }

        return this.prisma.room_media.findMany({
            where: {
                room_id: roomId,
            },
            select: {
                kind: true,
                sort_order: true,
                created_at: true,
                media: {
                    select: {
                        media_id: true,
                        url: true,
                        original_filename: true,
                        media_type: true,
                        mime_type: true,
                        size_bytes: true,
                        created_at: true,
                    },
                },
            },
            orderBy: [
                { sort_order: 'asc' },
                { created_at: 'asc' },
            ],
        });
    }

    async deleteRoomMedia(userId: string, roomId: string, mediaId: string) {
        let storageKeyToDelete: string | null = null;

        try {
            await this.prisma.$transaction(async (tx) => {
                await this.ensureRoomOwner(tx, userId, roomId);

                const relation = await tx.room_media.findFirst({
                    where: {
                        room_id: roomId,
                        media_id: mediaId,
                    },
                    select: {
                        media_id: true,
                    },
                });

                if (!relation) {
                    throw new NotFoundException('Media no encontrada para esta sala');
                }

                await tx.room_media.deleteMany({
                    where: {
                        room_id: roomId,
                        media_id: mediaId,
                    },
                });

                storageKeyToDelete = await this.deleteMediaIfOrphan(tx, mediaId);
            });

            if (storageKeyToDelete) {
                await this.deletePhysicalFile(storageKeyToDelete);
            }

            return {
                message: 'Media de la sala eliminada correctamente',
            };
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof ForbiddenException
            ) {
                throw error;
            }

            throw new InternalServerErrorException(
                'Error al eliminar la media de la sala',
            );
        }
    }
}