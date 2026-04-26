/**
 * migrate-to-ledger.mjs
 *
 * One-time migration: converts legacy User documents from flat integer fields
 * (entitledDays / usedDays / remainingDays) to the new AnnualLeaveBalance
 * embedded document structure.
 *
 * Safe to run multiple times — documents that already have annualLeave are skipped.
 *
 * Usage:
 *   MONGODB_URI="mongodb+srv://..." node migrate-to-ledger.mjs
 */

import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI
if (!uri) { console.error('Set MONGODB_URI before running.'); process.exit(1) }

const client = new MongoClient(uri)
try {
  await client.connect()
  const db    = client.db()
  const users = db.collection('users')

  // Only touch documents that don't yet have the annualLeave sub-document
  const legacy = await users.find({ annualLeave: { $exists: false } }).toArray()
  console.log(`Found ${legacy.length} legacy user document(s) to migrate.`)

  let migrated = 0
  for (const u of legacy) {
    const entitled  = u.entitledDays  ?? 0
    const usedDays  = u.usedDays      ?? 0

    await users.updateOne(
      { _id: u._id },
      {
        $set: {
          annualLeave: {
            entitled:                  entitled,
            transferred:               0,
            startingBalanceAdjustment: 0,
            used:                      usedDays,
          }
        }
        // Legacy fields are left in place (non-destructive).
        // They can be removed later with a follow-up $unset migration once
        // the new code has been running stably in production.
      }
    )
    migrated++
    console.log(`  ✓ Migrated: ${u.name ?? u.email ?? u._id}  (entitled=${entitled}, used=${usedDays})`)
  }

  if (migrated === 0) {
    console.log('All documents already migrated. Nothing to do.')
  } else {
    console.log(`\nMigrated ${migrated} document(s). Done.`)
  }
} finally {
  await client.close()
}
