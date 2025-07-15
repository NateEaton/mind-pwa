/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3055250471")

  // update field
  collection.fields.addAt(4, new Field({
    "hidden": false,
    "id": "json848463037",
    "maxSize": 0,
    "name": "daily_breakdown",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "json"
  }))

  // update field
  collection.fields.addAt(5, new Field({
    "hidden": false,
    "id": "json2535431193",
    "maxSize": 0,
    "name": "totals",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3055250471")

  // update field
  collection.fields.addAt(4, new Field({
    "hidden": false,
    "id": "json848463037",
    "maxSize": 0,
    "name": "daily_counts",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "json"
  }))

  // update field
  collection.fields.addAt(5, new Field({
    "hidden": false,
    "id": "json2535431193",
    "maxSize": 0,
    "name": "weekly_counts",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
})
