import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load direct connection (not pooled)
dotenv.config({ path: '.env.direct' });

const prisma = new PrismaClient();

async function addWorkHours() {
  try {
    console.log('🔄 Adding work hours for all doctors...\n');
    console.log('📍 Using DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 30) + '...\n');

    // Get all doctors
    const doctors = await prisma.doctors.findMany({
      select: {
        id: true,
        user_id: true,
        specialties: true
      }
    });

    if (doctors.length === 0) {
      console.log('❌ No doctors found in database');
      console.log('💡 Register as a doctor in the frontend first!');
      return;
    }

    console.log(`Found ${doctors.length} doctor(s)\n`);

    for (const doctor of doctors) {
      // Check if work hours already exist
      const existing = await prisma.doctor_work_hours.findFirst({
        where: { doctor_id: doctor.id }
      });

      if (existing) {
        console.log(`⏭️  Doctor ${doctor.id.substring(0, 8)}... already has work hours, skipping...`);
        continue;
      }

      console.log(`➕ Adding work hours for doctor ${doctor.id.substring(0, 8)}...`);

      // Add work hours for Monday to Friday (1-5)
      // 9 AM to 5 PM
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

      // Add work hours for Saturday (6)
      // 9 AM to 1 PM
      await prisma.doctor_work_hours.create({
        data: {
          doctor_id: doctor.id,
          weekday: 6,
          start_time: '09:00',
          end_time: '13:00'
        }
      });

      console.log(`✅ Added work hours (Mon-Fri 9-5, Sat 9-1)\n`);
    }

    console.log('🎉 Work hours added successfully for all doctors!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\n💡 Tip: Make sure you are using the DIRECT connection (port 5432) in .env.direct');
  } finally {
    await prisma.$disconnect();
  }
}

addWorkHours();
