import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotifyService } from '../../common/notify/notify.service';
import { CreateSafeZoneDto } from './dto/create-safe-zone.dto';
import { UpdateSafeZoneDto } from './dto/update-safe-zone.dto';
import { ReportLocationDto } from './dto/report-location.dto';

// Don't fire more than one wander alert per patient within this window.
const WANDER_ALERT_THROTTLE_MS = 10 * 60 * 1000;
// Keep the breadcrumb trail lightweight.
const TRAIL_LIMIT = 100;

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
  ) {}

  private async ensureCaregiverAccess(caregiverId: string, patientId: string) {
    const link = await this.prisma.patientCaregiver.findUnique({
      where: { patientId_caregiverId: { patientId, caregiverId } },
    });
    if (!link) throw new ForbiddenException('No access to this patient');
  }

  /** Great-circle distance between two coordinates, in metres. */
  private distanceM(
    aLat: number,
    aLng: number,
    bLat: number,
    bLng: number,
  ): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const lat1 = toRad(aLat);
    const lat2 = toRad(bLat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // ----- Safe zones (caregiver) -----

  async listSafeZones(caregiverId: string, patientId: string) {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    return this.prisma.safeZone.findMany({
      where: { patientId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createSafeZone(
    caregiverId: string,
    patientId: string,
    dto: CreateSafeZoneDto,
  ) {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    return this.prisma.safeZone.create({
      data: {
        patientId,
        name: dto.name,
        latitude: dto.latitude,
        longitude: dto.longitude,
        radiusM: dto.radiusM ?? 150,
        createdById: caregiverId,
      },
    });
  }

  async updateSafeZone(
    caregiverId: string,
    patientId: string,
    zoneId: string,
    dto: UpdateSafeZoneDto,
  ) {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    const zone = await this.prisma.safeZone.findUnique({ where: { id: zoneId } });
    if (!zone || zone.patientId !== patientId) {
      throw new NotFoundException('Safe zone not found');
    }
    return this.prisma.safeZone.update({
      where: { id: zoneId },
      data: {
        name: dto.name ?? undefined,
        latitude: dto.latitude ?? undefined,
        longitude: dto.longitude ?? undefined,
        radiusM: dto.radiusM ?? undefined,
        isActive: dto.isActive ?? undefined,
      },
    });
  }

  async removeSafeZone(caregiverId: string, patientId: string, zoneId: string) {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    const zone = await this.prisma.safeZone.findUnique({ where: { id: zoneId } });
    if (!zone || zone.patientId !== patientId) {
      throw new NotFoundException('Safe zone not found');
    }
    await this.prisma.safeZone.delete({ where: { id: zoneId } });
    return { success: true };
  }

  // ----- Live location (caregiver) -----

  /** Last known fix + safe-zone status for the caregiver's live map. */
  async getLatest(caregiverId: string, patientId: string) {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    const [settings, zones] = await Promise.all([
      this.prisma.patientCareSettings.findUnique({ where: { patientId } }),
      this.prisma.safeZone.findMany({ where: { patientId, isActive: true } }),
    ]);

    let nearestZone: { name: string; distanceM: number } | null = null;
    if (settings?.lastKnownLat != null && settings?.lastKnownLng != null) {
      for (const z of zones) {
        const d = this.distanceM(
          settings.lastKnownLat,
          settings.lastKnownLng,
          z.latitude,
          z.longitude,
        );
        if (!nearestZone || d < nearestZone.distanceM) {
          nearestZone = { name: z.name, distanceM: Math.round(d) };
        }
      }
    }

    return {
      latitude: settings?.lastKnownLat ?? null,
      longitude: settings?.lastKnownLng ?? null,
      lastLocationAt: settings?.lastLocationAt ?? null,
      insideSafeZone: settings?.lastKnownInsideSafeZone ?? null,
      nearestZone,
      hasZones: zones.length > 0,
      zones,
    };
  }

  /** Recent breadcrumb trail (newest first) for the caregiver map. */
  async getTrail(caregiverId: string, patientId: string, limit = 50) {
    await this.ensureCaregiverAccess(caregiverId, patientId);
    return this.prisma.locationPing.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(TRAIL_LIMIT, limit)),
      select: {
        id: true,
        latitude: true,
        longitude: true,
        accuracyM: true,
        insideSafeZone: true,
        source: true,
        createdAt: true,
      },
    });
  }

  // ----- Ingestion + wander detection (patient device) -----

  async ingestPing(patientId: string, dto: ReportLocationDto) {
    const zones = await this.prisma.safeZone.findMany({
      where: { patientId, isActive: true },
    });

    // insideSafeZone is null when no zones are configured (we can't judge).
    const inside =
      zones.length === 0
        ? null
        : zones.some(
            (z) =>
              this.distanceM(dto.latitude, dto.longitude, z.latitude, z.longitude) <=
              z.radiusM,
          );

    const now = new Date();
    const prev = await this.prisma.patientCareSettings.findUnique({
      where: { patientId },
    });
    const prevInside = prev?.lastKnownInsideSafeZone ?? null;

    // Alert on a transition to "outside" (or first fix already outside).
    const wanderCandidate =
      zones.length > 0 && inside === false && prevInside !== false;
    const throttleOk =
      !prev?.lastWanderAlertAt ||
      now.getTime() - prev.lastWanderAlertAt.getTime() > WANDER_ALERT_THROTTLE_MS;
    const fireWander = wanderCandidate && throttleOk;

    await this.prisma.locationPing.create({
      data: {
        patientId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracyM: dto.accuracyM ?? null,
        battery: dto.battery ?? null,
        insideSafeZone: inside,
        source: dto.source ?? 'app',
      },
    });

    await this.prisma.patientCareSettings.upsert({
      where: { patientId },
      create: {
        patientId,
        lastKnownLat: dto.latitude,
        lastKnownLng: dto.longitude,
        lastLocationAt: now,
        lastKnownInsideSafeZone: inside,
        lastWanderAlertAt: fireWander ? now : null,
      },
      update: {
        lastKnownLat: dto.latitude,
        lastKnownLng: dto.longitude,
        lastLocationAt: now,
        lastKnownInsideSafeZone: inside,
        ...(fireWander ? { lastWanderAlertAt: now } : {}),
      },
    });

    if (fireWander) {
      await this.sendWanderAlert(patientId, dto.latitude, dto.longitude, zones);
    }

    return { insideSafeZone: inside };
  }

  private async sendWanderAlert(
    patientId: string,
    lat: number,
    lng: number,
    zones: { name: string; latitude: number; longitude: number }[],
  ) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { firstName: true, lastName: true },
    });
    const name = patient
      ? `${patient.firstName} ${patient.lastName}`.trim()
      : 'Your loved one';

    let nearest: { name: string; distanceM: number } | null = null;
    for (const z of zones) {
      const d = this.distanceM(lat, lng, z.latitude, z.longitude);
      if (!nearest || d < nearest.distanceM) {
        nearest = { name: z.name, distanceM: Math.round(d) };
      }
    }

    const distanceText = nearest
      ? ` about ${this.formatDistance(nearest.distanceM)} from ${nearest.name}`
      : '';

    await this.notify.notifyCaregivers(patientId, {
      title: '⚠️ Left a safe area',
      body: `${name} appears to have left their safe area${distanceText}. Tap to see their location.`,
      type: 'WANDER_ALERT',
      metadata: { patientId, latitude: lat, longitude: lng },
    });
    this.logger.warn(`[WANDER] Alert sent for patient ${patientId}`);
  }

  private formatDistance(m: number): string {
    return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
  }

  // ----- SOS (patient device) -----

  async sos(patientId: string, dto: Partial<ReportLocationDto>) {
    const hasCoords =
      typeof dto.latitude === 'number' && typeof dto.longitude === 'number';

    if (hasCoords) {
      // Recording the location is best-effort — never let a location-write
      // failure stop the actual SOS alert from reaching the care circle.
      try {
        await this.ingestPing(patientId, {
          latitude: dto.latitude!,
          longitude: dto.longitude!,
          accuracyM: dto.accuracyM,
          battery: dto.battery,
          source: 'sos',
        });
      } catch (err) {
        this.logger.error(
          `[SOS] Failed to record location for patient ${patientId}; ` +
            `continuing with the alert`,
          err as Error,
        );
      }
    }

    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { firstName: true, lastName: true },
    });
    const name = patient
      ? `${patient.firstName} ${patient.lastName}`.trim()
      : 'Your loved one';

    const count = await this.notify.notifyCaregivers(patientId, {
      title: '🆘 SOS — help needed',
      body: hasCoords
        ? `${name} pressed the SOS button. Tap to see their location and call them now.`
        : `${name} pressed the SOS button. Please contact them now.`,
      type: 'SOS_ALERT',
      metadata: hasCoords
        ? { patientId, latitude: dto.latitude, longitude: dto.longitude }
        : { patientId },
    });

    this.logger.warn(`[SOS] Patient ${patientId} triggered SOS → ${count} caregivers`);
    return { success: true, notifiedCaregivers: count };
  }
}
