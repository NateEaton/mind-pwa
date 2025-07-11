/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3441106343")

  // remove field
  collection.fields.removeById("json2779133046")

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3441106343")

  // add field
  collection.fields.addAt(5, new Field({
    "hidden": false,
    "id": "json2779133046",
    "maxSize": 0,
    "name": "weekly_counts",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
})
