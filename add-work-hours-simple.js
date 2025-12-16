import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();

async function addWorkHours() {
  try {
    console.log('🔄 Adding work hours for all doctors...\n');
    
    const doctors = await prisma.doctors.findMany({
      select: {
        id: true,
        user_id: true,
        specialties: true
      }
    });

    if (doctors.length === 0) {
      console.log('❌ No doctors found in database');
      return;
    }

    console.log(`✅ Found ${doctors.length} doctor(s)\n`);

    for (const doctor of doctors) {
      const existing = await prisma.doctor_work_hours.findFirst({
        where: { doctor_id: doctor.id }
      });

      if (existing) {
        console.log(`⏭️  Doctor ${doctor.id.substring(0, 8)}... already has work hours, skipping...`);
        continue;
      }

      console.log(`➕ Adding work hours for doctor ${doctor.id.substring(0, 8)}...`);

      for (let weekday = 1; weekday <= 5; weekday++) {
        await prisma.doctor_work_hours.create({
          data: {
            doctor_id: doctor.id,
            weekday: weekday,
            start_time: '09:00',
            end_time: '17:00'
          }
        });
      }

      await prisma.doctor_work_hours.create({
        data: {
          doctor_id: doctor.id,
          weekday: 6,
          start_time: '09:00',
          end_time: '13:00'
        }
      });

      console.log(`✅ Added work hours (Mon-Fri 9AM-5PM, Sat 9AM-1PM)\n`);
    }

    console.log('🎉 Work hours added successfully for all doctors!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addWorkHours();
