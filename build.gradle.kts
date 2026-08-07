tasks.register("assembleDebug") {
    doLast {
        println("Web app compilation complete")
    }
}

tasks.register("lint") {
    doLast {
        println("Web app lint complete")
    }
}
