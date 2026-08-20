import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/** The learner sees only cards a staff member has explicitly published. */
@Injectable()
export class LearnerReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(learnerId: string, language: 'en' | 'fr') {
    const cards = await this.prisma.reportCard.findMany({
      where: { learnerId, publishedAt: { not: null } },
      orderBy: [{ academicYear: 'desc' }, { term: 'asc' }],
      select: {
        id: true, term: true, academicYear: true, averageMark: true,
        totalCoefficient: true, classPosition: true, classSize: true, remark: true, publishedAt: true,
        lines: { orderBy: { subject: { nameEn: 'asc' } }, select: { mark: true, coefficient: true, comment: true, subject: { select: { nameEn: true, nameFr: true } } } },
      },
    });
    return { cards: cards.map((card) => ({
      id: card.id, term: card.term, academicYear: card.academicYear,
      average: card.averageMark === null ? null : Number(card.averageMark),
      totalCoefficient: card.totalCoefficient, position: card.classPosition, classSize: card.classSize,
      remarkKey: card.remark, publishedAt: card.publishedAt?.toISOString() ?? null,
      lines: card.lines.map((line) => ({
        subject: language === 'fr' ? line.subject.nameFr : line.subject.nameEn,
        mark: Number(line.mark), coefficient: line.coefficient, comment: line.comment,
      })),
    })) };
  }
}
