/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3055250471")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX idx_user_week ON weekly_data (user, week_start_date)"
    ]
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3055250471")

  // update collection data
  unmarshal({
    "indexes": []
  }, collection)

  return app.save(collection)
})
